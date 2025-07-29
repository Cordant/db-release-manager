import {Token, TokenType} from './tokens.js';

export class Lexer {
  private index = 0;
  private tokens: Token[] = [];

  constructor(private input: string) {
  }

  scan(): Token[] {
    while (!this.endOfInput() && this.peek() !== '$' && this.peekNext() !== '{') {
      this.advance();
    }

    if (this.endOfInput()) {
      return this.tokens;
    }

    this.consume('$', '{');
    this.tokens.push({
      type: TokenType.EXPRESSION_START,
      value: '${',
      position: this.index - 2,
    });

    const isValid = this.expression();
    if (!isValid) {
      // Remove all tokens inserted since start
      this.removeTokensUntilLastExpressionStart();
    }

    // Scan the remaining part to see if we can find more expressions
    return this.scan();
  }

  private expression() {
    return this.action();
  }

  private action() {
    const startPosition = this.index;
    while (!this.endOfInput() && this.peek() !== ':' && this.peek() !== '(') {
      if (this.peek() === '}') return false;
      this.advance();
    }
    if (this.endOfInput()) {
      return false;
    }
    this.advance();

    const action = this.input.substring(startPosition, this.index - 1).trim();
    if (!action) {
      return false;
    }
    this.tokens.push({
      type: TokenType.ACTION,
      value: action,
      position: startPosition,
    });

    if (this.peekPrevious() === '(') {
      this.tokens.push({
        type: TokenType.OPTIONS_START,
        value: '(',
        position: this.index - 1,
      });

      return this.options();
    }

    if (this.peekPrevious() === ':') {
      this.tokens.push({
        type: TokenType.OPERATION_SEPARATOR,
        value: ':',
        position: this.index - 1,
      });

      return this.operation();
    }

    // Should not happen, but we return false if it does
    return false;
  }

  private options(): boolean {
    let startPosition = this.index;
    while (!this.endOfInput() && this.peek() !== ')' && this.peek() !== ',') {
      const char = this.advance();
      if (char === '$' && this.peek() === '{') {
        this.tokens.push({
          type: TokenType.OPTION,
          value: this.input.substring(startPosition, this.index - 1).trim(),
          position: startPosition,
        });

        // Nested expression
        this.advance();
        this.tokens.push({
          type: TokenType.EXPRESSION_START,
          value: '${',
          position: this.index - 2,
        });
        const isValid = this.expression();
        if (!isValid) {
          this.removeTokensUntilLastExpressionStart();
          return false;
        }
        startPosition = this.index;
      }
    }
    if (this.endOfInput()) {
      return false;
    }
    this.advance();

    const option = this.input.substring(startPosition, this.index - 1).trim();
    if (option) {
      this.tokens.push({
        type: TokenType.OPTION,
        value: option,
        position: this.index - option.length,
      });
    }

    if (this.peekPrevious() === ',') {
      this.tokens.push({
        type: TokenType.OPTION_SEPARATOR,
        value: ',',
        position: this.index - 1,
      });
      return this.options();
    }

    if (this.peekPrevious() === ')') {
      this.tokens.push({
        type: TokenType.OPTIONS_END,
        value: ')',
        position: this.index - 1,
      });
    }

    if (!this.consume(':')) {
      return false;
    }

    this.tokens.push({
      type: TokenType.OPERATION_SEPARATOR,
      value: ':',
      position: this.index - 1,
    });

    return this.operation();
  }

  private operation(): boolean {
    let startPosition = this.index;
    while (!this.endOfInput() && this.peek() !== ',' && this.peek() !== '}') {
      const char = this.advance();
      if (char === '$' && this.peek() === '{') {
        const operation = this.input.substring(startPosition, this.index - 1).trim();
        if (!operation) {
          this.tokens.push({
            type: TokenType.OPERATION,
            value: operation,
            position: startPosition,
          });
        }

        // Nested expression
        this.advance();
        this.tokens.push({
          type: TokenType.EXPRESSION_START,
          value: '${',
          position: this.index - 2,
        });
        const isValid = this.expression();
        if (!isValid) {
          this.removeTokensUntilLastExpressionStart();
          return false;
        }
        startPosition = this.index;
      }
    }

    if (this.endOfInput()) {
      return false;
    }
    this.advance();

    const operation = this.input.substring(startPosition, this.index - 1).trim();
    const previousTokenIsExpressionEnd = this.peekPrevious() === '}';
    if (!operation && !previousTokenIsExpressionEnd) {
      return false;
    }

    if (operation) {
      this.tokens.push({
        type: TokenType.OPERATION,
        value: operation,
        position: startPosition,
      });
    }

    if (this.peekPrevious() === ',') {
      this.tokens.push({
        type: TokenType.FALLBACK_SEPARATOR,
        value: ',',
        position: this.index - 1,
      });

      return this.fallback();
    }

    if (this.peekPrevious() === '}') {
      this.tokens.push({
        type: TokenType.EXPRESSION_END,
        value: '}',
        position: this.index - 1,
      });

      return true;
    }

    // Should not happen, but we return false if it does
    return false;
  }

  private fallback(): boolean {
    let startPosition = this.index;
    let hasProcessedNestedExpression = false;

    while (!this.endOfInput() && this.peek() !== '}') {
      const char = this.advance();
      if (char === '$' && this.peek() === '{') {
        const prefix = this.input.substring(startPosition, this.index - 1).trim();

        // Only push a fallback token if there's a prefix
        if (prefix) {
          this.tokens.push({
            type: TokenType.FALLBACK,
            value: prefix,
            position: startPosition,
          });
        }

        // Nested expression
        this.advance();
        this.tokens.push({
          type: TokenType.EXPRESSION_START,
          value: '${',
          position: this.index - 2,
        });
        const isValid = this.expression();
        if (!isValid) {
          this.removeTokensUntilLastExpressionStart();
          return false;
        }

        hasProcessedNestedExpression = true;
        startPosition = this.index;
      }
    }

    if (this.endOfInput()) {
      return false;
    }
    this.advance();

    const fallback = this.input.substring(startPosition, this.index - 1).trim();

    // If we have a non-empty fallback value after the last nested expression, push it
    if (fallback) {
      this.tokens.push({
        type: TokenType.FALLBACK,
        value: fallback,
        position: startPosition,
      });
    } else if (!hasProcessedNestedExpression) {
      // Only return false if we haven't processed any nested expressions
      // and the fallback is empty
      return false;
    }

    this.tokens.push({
      type: TokenType.EXPRESSION_END,
      value: '}',
      position: this.index - 1,
    });

    return true;
  }

  private advance() {
    return this.input[this.index++];
  }

  private peekPrevious() {
    return this.input[this.index - 1];
  }

  private peek() {
    return this.input[this.index];
  }

  private peekNext() {
    return this.input[this.index + 1];
  }

  private consume(...chars: string[]) {
    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (this.input[this.index + i] !== char) {
        return false;
      }
    }
    this.index += chars.length;
    return true;
  }

  private endOfInput() {
    return this.index >= this.input.length;
  }

  private removeTokensUntilLastExpressionStart() {
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const token = this.tokens[i];
      if (token.type === TokenType.EXPRESSION_START) {
        this.tokens.splice(i);
        break;
      }
    }
  }
}

export function tokenize(input: string) {
  return new Lexer(input).scan();
}

// console.log(tokenize('first-${ssm:/aws/${env:stage}/store/key-1}-second-${ssm:/aws/parameter/store/key-2}'));