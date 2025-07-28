import {Token, TokenType, TokenVisitor} from './tokens.js';
import {tokenize} from './lexer.js';

/**
 * Interface for a parsed dynamic string expression
 */
export interface ParsedExpression {
  startIndex: number;
  endIndex: number;

  action: string;
  options: string[];
  operation: string;
  fallback?: string;

  raw: string;

  expressions: ParsedExpression[];
}

/**
 * Result of parsing a dynamic string
 */
export interface ParserResult {
  expressions: ParsedExpression[];
  raw: string;
}

/**
 * @description
 *
 * This parser resolved the following pattern
 *
 * ${action:/operation/to/location}
 * ${action:/operation/to/location$.json.operation}
 * ${action:operation-without-slash}
 * ${action(optionA):/operation/to/location}
 * ${action(optionA):/operation/to/location$.json.operation}
 * ${action(optionA):operation-without-slash$.json.operation}
 * ${action(optionA, optionB):/operation/to/location}
 * ${action(optionA, optionB):/operation/to/location$.json.operation}
 * ${action(optionA, optionB):operation-without-slash$.json.operation}
 * ${action(optionA, optionB, optionC):/operation/to/location}
 * ${action(optionA, optionB, optionC):/operation/to/location$.json.operation}
 * ${action(optionA, optionB, optionC):operation-without-slash$.json.operation}
 * ${action(optionA, optionB, optionC, ...):/operation/to/location}
 * ${action(optionA, optionB, optionC, ...):/operation/to/location$.json.operation}
 * ${action(optionA, optionB, optionC, ...):operation-without-slash$.json.operation}
 * ${action(optionA, optionB, optionC, ...):any-operation$.json.operation}
 * ${action(optionA, optionB, optionC, ...):any-operation$.json.operation}
 *
 *
 * You can also have dynamic string inside a dynamic string:
 * ${action:/operation/${nested:/other/operation}}
 * ${action:/operation/${nested(param):/other/operation$.json.operation}}
 * ${action:operation-${nested(param):/other/operation$.json.operation}-with-nested}
 * ${action:operation-${nested(param):/other/${morenested:/recursive-nested-paths}/operation$.json.operation}-with-nested}
 *
 * Escape characters can be used:
 * \${not-parsed-as-dynamic}
 *
 * Real-world examples:
 * ${ssm:/aws/parameter/store/key}
 * ${ssm(profile-${self:stage}):/aws/parameter/store/key}
 * ${secretsmanager:/aws/secrets/db-password$.password}
 * ${secretsmanager:/aws/${self:stage}/db-password$.password}
 * ${env:config.database$.connection.string}
 */
export class Parser implements TokenVisitor {
  
  visit(token: Token, currentExpression: ParsedExpression): void {
    switch (token.type) {
      case TokenType.EXPRESSION_START:
        this.visitExpressionStart(token, currentExpression);
        break;
      case TokenType.EXPRESSION_END:
        this.visitExpressionEnd(token, currentExpression);
        break;
      case TokenType.ACTION:
        this.visitAction(token, currentExpression);
        break;
      case TokenType.OPTIONS_START:
        this.visitOptionsStart(token, currentExpression);
        break;
      case TokenType.OPTIONS_END:
        this.visitOptionsEnd(token, currentExpression);
        break;
      case TokenType.OPTION:
        this.visitOption(token, currentExpression);
        break;
      case TokenType.OPTION_SEPARATOR:
        this.visitOptionSeparator(token, currentExpression);
        break;
      case TokenType.OPERATION_SEPARATOR:
        this.visitOperationSeparator(token, currentExpression);
        break;
      case TokenType.OPERATION:
        this.visitOperation(token, currentExpression);
        break;
      case TokenType.FALLBACK_SEPARATOR:
        this.visitFallbackSeparator(token, currentExpression);
        break;
      case TokenType.FALLBACK:
        this.visitFallback(token, currentExpression);
        break;
    }
  }
  visitExpressionStart(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.startIndex = token.position;
    currentExpression.raw = token.value;
  }
  visitExpressionEnd(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.endIndex = token.position + token.value.length;
    currentExpression.raw += token.value;
  }
  visitAction(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.action = token.value;
    currentExpression.raw += token.value;
  }
  visitOptionsStart(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.options = [];
    currentExpression.raw += token.value;
  }
  visitOptionsEnd(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.raw += token.value;
  }
  visitOption(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.options.push(token.value);
    currentExpression.raw += token.value;
  }
  visitOptionSeparator(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.raw += token.value;
  }
  visitOperationSeparator(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.raw += token.value;
  }
  visitOperation(token: Token, currentExpression: ParsedExpression): void {
    // Append to operation instead of replacing it to handle nested expressions correctly
    if (!currentExpression.operation) {
      currentExpression.operation = token.value;
    } else {
      currentExpression.operation += token.value;
    }
    currentExpression.raw += token.value;
  }
  visitFallbackSeparator(token: Token, currentExpression: ParsedExpression): void {
    currentExpression.raw += token.value;
  }
  visitFallback(token: Token, currentExpression: ParsedExpression): void {
    // Store the fallback value in the dedicated field
    if (!currentExpression.fallback) {
      currentExpression.fallback = token.value;
    } else {
      currentExpression.fallback += token.value;
    }
    currentExpression.raw += token.value;
  }

  /**
   * Parses a string containing dynamic expressions
   * @param input The input string to parse
   * @returns A ParserResult object containing the parsed expressions
   */
  public parseString(input: string): ParserResult {
    const result: ParserResult = {
      expressions: [],
      raw: input
    };

    try {
      // Get tokens from the lexer
      const tokens = tokenize(input);

      // Process tokens to build expressions
      this.processTokens(tokens, result);
      
      return result;
    } catch (error) {
      console.error('Error parsing string:', error);
      return result;
    }
  }
  
  /**
   * Process tokens to build expressions
   * @param tokens The tokens to process
   * @param result The result object to populate
   */
  private processTokens(tokens: Token[], result: ParserResult): void {
    if (!tokens || tokens.length === 0) {
      return;
    }
    
    const expressionStack: ParsedExpression[] = [];
    let currentExpression: ParsedExpression | null = null;
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      try {
        if (token.type === TokenType.EXPRESSION_START) {
          // Create a new expression
          const newExpression: ParsedExpression = {
            startIndex: 0,
            endIndex: 0,
            action: '',
            options: [],
            operation: '',
            fallback: '',
            raw: '',
            expressions: []
          };
          
          // If we have a current expression, this is a nested expression
          if (currentExpression) {
            expressionStack.push(currentExpression);
            currentExpression.expressions.push(newExpression);
          } else {
            // This is a top-level expression
            result.expressions.push(newExpression);
          }
          
          currentExpression = newExpression;
        }
        
        // Process the token with the visitor
        if (currentExpression) {
          this.visit(token, currentExpression);
        }
        
        if (token.type === TokenType.EXPRESSION_END && currentExpression) {
          // If we have expressions on the stack, pop the last one and make it current
          if (expressionStack.length > 0) {
            currentExpression = expressionStack.pop() || null;
          } else {
            // This was a top-level expression, reset current
            currentExpression = null;
          }
        }
      } catch (error) {
        console.error(`Error processing token ${i}:`, token, error);
      }
    }
    
    // Fix raw values for expressions with nested expressions
    this.fixRawValues(result.expressions, result.raw);
  }
  
  /**
   * Fix raw values, operations, options, and fallback values for expressions with nested expressions
   * @param expressions The expressions to fix
   * @param fullString The full input string
   */
  private fixRawValues(expressions: ParsedExpression[], fullString: string): void {
    for (const expr of expressions) {
      // Extract the raw value from the full string using the start and end indices
      expr.raw = fullString.substring(expr.startIndex, expr.endIndex);
      
      // For expressions with nested expressions, we need to fix the operation string,
      // options array, and fallback value to include the raw form of the nested expressions
      if (expr.expressions && expr.expressions.length > 0) {
        // First, recursively fix nested expressions
        this.fixRawValues(expr.expressions, fullString);
        
        // Check if this expression has options (indicated by presence of '(' in the raw string)
        const hasOptions = expr.raw.includes('(') && expr.raw.includes(')');
        
        if (hasOptions) {
          // Extract the options part from the raw string
          const optionsStartIndex = expr.raw.indexOf('(') + 1;
          const optionsEndIndex = expr.raw.lastIndexOf(')');
          
          if (optionsStartIndex > 0 && optionsEndIndex > optionsStartIndex) {
            // Get the raw options string
            const optionsString = expr.raw.substring(optionsStartIndex, optionsEndIndex);
            
            // Parse the options string to get the correct options with nested expressions
            // We need to split by commas, but only those that are not inside nested expressions
            const options: string[] = [];
            let currentOption = '';
            let nestedLevel = 0;
            
            for (let i = 0; i < optionsString.length; i++) {
              const char = optionsString[i];
              
              if (char === '$' && optionsString[i + 1] === '{') {
                nestedLevel++;
                currentOption += char + optionsString[i + 1];
                i++; // Skip the next character ('{')
              } else if (char === '}' && nestedLevel > 0) {
                nestedLevel--;
                currentOption += char;
              } else if (char === ',' && nestedLevel === 0) {
                // This is a top-level comma, use it to split options
                options.push(currentOption.trim());
                currentOption = '';
              } else {
                currentOption += char;
              }
            }
            
            // Add the last option if there is one
            if (currentOption.trim()) {
              options.push(currentOption.trim());
            }
            
            // Replace the options array with the correctly parsed options
            expr.options = options;
          }
        }
        
        // Extract the operation part from the raw string
        // The operation starts after the action and options (if any) followed by ':'
        // We need to find the correct colon that separates options from operation
        let operationStartIndex = -1;
        
        if (hasOptions) {
          // If we have options, find the colon that comes after the closing parenthesis
          const closingParenIndex = expr.raw.lastIndexOf(')');
          if (closingParenIndex > 0) {
            const colonAfterOptions = expr.raw.indexOf(':', closingParenIndex);
            if (colonAfterOptions > 0) {
              operationStartIndex = colonAfterOptions + 1;
            }
          }
        } else {
          // No options, find the first colon after the action
          operationStartIndex = expr.raw.indexOf(':') + 1;
        }
        
        // Check if this expression has a fallback (indicated by presence of ',' after the operation)
        const hasFallback = expr.raw.includes(',', operationStartIndex);
        
        if (hasFallback) {
          // Find the comma that separates operation from fallback
          const commaIndex = expr.raw.indexOf(',', operationStartIndex);
          
          if (commaIndex > 0) {
            // Extract operation up to the comma
            const operationEndIndex = commaIndex;
            if (operationStartIndex > 0 && operationStartIndex < operationEndIndex) {
              expr.operation = expr.raw.substring(operationStartIndex, operationEndIndex);
            }
            
            // Extract fallback from after the comma to before the closing brace
            const fallbackStartIndex = commaIndex + 1;
            const fallbackEndIndex = expr.raw.length - 1; // Exclude the closing '}'
            
            if (fallbackStartIndex > 0 && fallbackStartIndex < fallbackEndIndex) {
              expr.fallback = expr.raw.substring(fallbackStartIndex, fallbackEndIndex).trim();
            }
          }
        } else {
          // No fallback, extract operation up to the closing brace
          const operationEndIndex = expr.raw.length - 1; // Exclude the closing '}'
          
          if (operationStartIndex > 0 && operationStartIndex < operationEndIndex) {
            expr.operation = expr.raw.substring(operationStartIndex, operationEndIndex);
          }
        }
      }
    }
  }
}

export function parse(input: string): ParserResult {
  return new Parser().parseString(input);
}

// // Example usage demonstrating fallback field in ParsedExpression
// console.log('Testing dynamic string parsing with fallback values:');
//
// // Test 1: Simple fallback value
// const testString1 = '${ssm:/aws/parameter/store/key-2, simple-fallback}';
// const result1 = new Parser().parseString(testString1);
// console.log('\nTest 1: Simple fallback value');
// console.log('Input:', testString1);
// console.log('Output:', JSON.stringify(result1, null, 2));
// console.log('Fallback value:', result1.expressions[0].fallback);
//
// // Test 2: Fallback with nested expression
// const testString2 = '${ssm:/aws/parameter/store/key-2, fallback-${env:default}}';
// const result2 = new Parser().parseString(testString2);
// console.log('\nTest 2: Fallback with nested expression');
// console.log('Input:', testString2);
// console.log('Output', JSON.stringify(result2, null, 2));
// console.log('Fallback value:', result2.expressions[0].fallback);
// console.log('Nested expression in fallback:', result2.expressions[0].expressions[0].raw);
//
// // Test 3: Multiple expressions with fallbacks
// const testString3 = 'first-${ssm:/aws/parameter/store/key-1, fallback1}-second-${env:STAGE, fallback2}';
// const result3 = new Parser().parseString(testString3);
// console.log('\nTest 3: Multiple expressions with fallbacks');
// console.log('Input:', testString3);
// console.log('Output:', JSON.stringify(result3, null, 2));
// console.log('First expression fallback:', result3.expressions[0].fallback);
// console.log('Second expression fallback:', result3.expressions[1].fallback);
//
// // Test 4: Nested expression inside option
// const testString4 = '${ssm(region-${env:AWS_REGION}):/aws/parameter/store/key}';
// const result4 = new Parser().parseString(testString4);
// console.log('\nTest 4: Nested expression inside option');
// console.log('Input:', testString4);
// console.log('Output:', JSON.stringify(result4, null, 2));
// console.log('Options:', result4.expressions[0].options);
//
// // Test 5: Complex nested expressions with JSON paths
// const testString5 = '${ssm:/aws/${env:STAGE}/db-${env:DB_NAME}/connection$.password.value}';
// const result5 = new Parser().parseString(testString5);
// console.log('\nTest 5: Complex nested expressions with JSON paths');
// console.log('Input:', testString5);
// console.log('Output:', JSON.stringify(result5, null, 2));
// console.log('Operation:', result5.expressions[0].operation);
//
// // Test 6: Multiple options with nested expressions
// const testString6 = '${ssm(profile-${env:PROFILE}, region-${env:REGION}):/config/key}';
// const result6 = new Parser().parseString(testString6);
// console.log('\nTest 6: Multiple options with nested expressions');
// console.log('Input:', testString6);
// console.log('Output:', JSON.stringify(result6, null, 2));
// console.log('Options:', result6.expressions[0].options);
//
// // Test 7: Escaped expressions and edge cases
// const testString7 = 'Normal text \\${not-parsed} ${ssm:/key} \\\\${still-not-parsed}';
// const result7 = new Parser().parseString(testString7);
// console.log('\nTest 7: Escaped expressions and edge cases');
// console.log('Input:', testString7);
// console.log('Output:', JSON.stringify(result7, null, 2));
// console.log('Expression count:', result7.expressions.length);
//
// // Test 8: Complex fallbacks with nested expressions and JSON paths
// const testString8 = '${ssm:/aws/db/password$.value, ${env:DEFAULT_PASSWORD}$.defaultValue}';
// const result8 = new Parser().parseString(testString8);
// console.log('\nTest 8: Complex fallbacks with nested expressions');
// console.log('Input:', testString8);
// console.log('Output:', JSON.stringify(result8, null, 2));
// console.log('Fallback:', result8.expressions[0].fallback);
