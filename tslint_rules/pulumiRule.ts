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
        if (node.kind === ts.SyntaxKind.BinaryExpression) {
            checkBinaryExpression(<ts.BinaryExpression>node);
        }

        ts.forEachChild(node, cb);
    }

    function checkBinaryExpression(node: ts.BinaryExpression) {
        if (isAssignmentOperator(node.operatorToken.kind) && !isInTopLevel(node)) {
            const symbol = checker.getSymbolAtLocation(node.left);
            if (symbol &&
                symbol.flags & ts.SymbolFlags.Variable) {
                const declaration = symbol.valueDeclaration;
                if (declaration &&
                    isInTopLevel(declaration)) {
                    ctx.addFailureAtNode(node.left, "Assignments cannot be made to top level objects.");
                }
            }
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
