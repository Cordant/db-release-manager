import {ParsedExpression} from './parser.js';

/**
 * Token types for the dynamic string parser
 */
export enum TokenType {
  EXPRESSION_START = 'EXPRESSION_START', // ${
  EXPRESSION_END = 'EXPRESSION_END',     // }
  ACTION = 'ACTION',             // The action part (e.g., ssm, secretsmanager)
  OPTIONS_START = 'OPTIONS_START',       // (
  OPTIONS_END = 'OPTIONS_END',           // )
  OPTION = 'OPTION',             // An individual option
  OPTION_SEPARATOR = 'OPTION_SEPARATOR', // ,
  OPERATION_SEPARATOR = 'OPERATION_SEPARATOR',     // :
  OPERATION = 'OPERATION',                 // The operation part
  FALLBACK_SEPARATOR = 'FALLBACK_SEPARATOR',
  FALLBACK = 'FALLBACK',
}

/**
 * Interface for a token
 */
export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Interface for visiting tokens
 */
export interface TokenVisitor {
  visit(token: Token, currentExpression: ParsedExpression): void;
  visitExpressionStart(token: Token, currentExpression: ParsedExpression): void;
  visitExpressionEnd(token: Token, currentExpression: ParsedExpression): void;
  visitAction(token: Token, currentExpression: ParsedExpression): void;
  visitOptionsStart(token: Token, currentExpression: ParsedExpression): void;
  visitOptionsEnd(token: Token, currentExpression: ParsedExpression): void;
  visitOption(token: Token, currentExpression: ParsedExpression): void;
  visitOptionSeparator(token: Token, currentExpression: ParsedExpression): void;
  visitOperationSeparator(token: Token, currentExpression: ParsedExpression): void;
  visitOperation(token: Token, currentExpression: ParsedExpression): void;
  visitFallbackSeparator(token: Token, currentExpression: ParsedExpression): void;
  visitFallback(token: Token, currentExpression: ParsedExpression): void;
}

