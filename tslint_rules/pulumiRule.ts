// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as Lint from "tslint";
import * as ts from "typescript";

export class Rule extends Lint.Rules.TypedRule {
    applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {
        return this.applyWithFunction(sourceFile, ctx => walk(program, ctx));
    }
}

function walk(program: ts.Program, ctx: Lint.WalkContext<void>) {
    const checker = program.getTypeChecker();
    ts.forEachChild(ctx.sourceFile, cb);
    return;

    // nested functions;
    function cb(node: ts.Node) {
        if (ts.isBinaryExpression(node)) {
            checkBinaryExpression(node);
        }
        else if (ts.isPostfixUnaryExpression(node) ||
                 ts.isPrefixUnaryExpression(node)) {
            checkUnaryExpression(node);
        }

        ts.forEachChild(node, cb);
    }

    function checkForWriteOfTopLevelVariableFromInsideFunction(
            node: ts.Expression | ts.ShorthandPropertyAssignment) {
        if (!isInTopLevel(node)) {
            const symbol = ts.isShorthandPropertyAssignment(node)
                ? checker.getShorthandAssignmentValueSymbol(node)
                : checker.getSymbolAtLocation(node);

            if (symbol &&
                symbol.flags & ts.SymbolFlags.Variable) {

                const declaration = symbol.valueDeclaration;
                if (declaration &&
                    isInTopLevel(declaration)) {

                    ctx.addFailureAtNode(
                        // tslint:disable-next-line:max-line-length
                        node, "Pulumi restriction: Writes cannot be made to top level objects from inside a functions.");
                }
            }
        }
    }

    function unwrapOuterExpressions(node: ts.Expression): ts.Expression {
        while (node && (ts.isTypeAssertion(node) ||
                        ts.isParenthesizedExpression(node))) {
            node = node.expression;
        }

        return node;
    }

    function checkBinaryExpression(node: ts.BinaryExpression) {
        if (isAssignmentOperator(node.operatorToken.kind)) {
            checkReference(node.left);
        }
    }

    function checkReference(node: ts.Expression) {
        node = unwrapOuterExpressions(node);

        if (ts.isObjectLiteralExpression(node)) {
            checkObjectLiteralAssignment(node);
        }
        else if (ts.isArrayLiteralExpression(node)) {
            checkArrayLiteralAssignment(node);
        }
        else {
            checkForWriteOfTopLevelVariableFromInsideFunction(node);
        }
    }

    function checkObjectLiteralAssignment(node: ts.ObjectLiteralExpression) {
        for (const property of node.properties) {
            if (ts.isShorthandPropertyAssignment(property)) {
                checkForWriteOfTopLevelVariableFromInsideFunction(property);
            }
            else if (ts.isPropertyAssignment(property) &&
                     ts.isIdentifier(property.name)) {
                checkReference(property.name);
            }
        }
    }

    function checkArrayLiteralAssignment(node: ts.ArrayLiteralExpression) {
        for (const element of node.elements) {
            checkReference(element);
        }
    }

    function checkUnaryExpression(node: ts.PostfixUnaryExpression | ts.PrefixUnaryExpression) {
        if (node.operator === ts.SyntaxKind.PlusPlusToken ||
            node.operator === ts.SyntaxKind.MinusMinusToken) {
            checkReference(node.operand);
        }
    }

    function isAssignmentOperator(token: ts.SyntaxKind): boolean {
        return token >= ts.SyntaxKind.FirstAssignment && token <= ts.SyntaxKind.LastAssignment;
    }

    function isInTopLevel(node: ts.Node) {
        while (node.parent) {
            if (ts.isFunctionLike(node.parent)) {
                return false;
            }

            node = node.parent;
        }

        return true;
    }
}
