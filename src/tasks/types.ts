/**
 * Types exist here to prevent strange or circular dependencies.
 */

export interface MinimalAnnotation {
  path: string;
  identifier: string;
  start_line: number;
  start_column: number;
}
