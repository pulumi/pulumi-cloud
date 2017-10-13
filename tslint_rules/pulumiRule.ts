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
        switch (node.kind) {
            case ts.SyntaxKind.BinaryExpression:
                checkBinaryExpression(<ts.BinaryExpression>node);
                break;
            case ts.SyntaxKind.PostfixUnaryExpression:
                checkUnaryExpression(<ts.PostfixUnaryExpression>node);
                break;
            case ts.SyntaxKind.PrefixUnaryExpression:
                checkUnaryExpression(<ts.PrefixUnaryExpression>node);
                break;
            default:
                break;
        }

        ts.forEachChild(node, cb);
    }

    function checkForWriteOfTopLevelVariableFromInsideFunction(node: ts.Node) {
        if (!isInTopLevel(node)) {
            const symbol = checker.getSymbolAtLocation(node);
            if (symbol &&
                symbol.flags & ts.SymbolFlags.Variable) {
                const declaration = symbol.valueDeclaration;
                if (declaration &&
                    isInTopLevel(declaration)) {
                    ctx.addFailureAtNode(
                        node, "Writes cannot be made to top level objects from inside a functions.");
                }
            }
        }
    }

    function checkBinaryExpression(node: ts.BinaryExpression) {
        if (isAssignmentOperator(node.operatorToken.kind)) {
            checkForWriteOfTopLevelVariableFromInsideFunction(node.left);
        }
    }

    function checkUnaryExpression(node: ts.PostfixUnaryExpression | ts.PrefixUnaryExpression) {
        if (node.operator === ts.SyntaxKind.PlusPlusToken ||
            node.operator === ts.SyntaxKind.MinusMinusToken) {
            checkForWriteOfTopLevelVariableFromInsideFunction(node.operand);
        }
    }

    function isAssignmentOperator(token: ts.SyntaxKind): boolean {
        return token >= ts.SyntaxKind.FirstAssignment && token <= ts.SyntaxKind.LastAssignment;
    }

    function isInTopLevel(node: ts.Node) {
        while (node.parent) {
            if (isFunctionLikeDeclarationKind(node.parent.kind)) {
                return false;
            }

            node = node.parent;
        }

        return true;
    }

    function isFunctionLikeDeclarationKind(kind: ts.SyntaxKind): boolean {
        switch (kind) {
            case ts.SyntaxKind.FunctionDeclaration:
            case ts.SyntaxKind.MethodDeclaration:
            case ts.SyntaxKind.Constructor:
            case ts.SyntaxKind.GetAccessor:
            case ts.SyntaxKind.SetAccessor:
            case ts.SyntaxKind.FunctionExpression:
            case ts.SyntaxKind.ArrowFunction:
                return true;
            default:
                return false;
        }
    }
}
