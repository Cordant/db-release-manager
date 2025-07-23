import path from 'path';

export class Paths {
  static current(...subpaths: string[]) {
    return new Paths('./postgres/release/current', ...subpaths);
  }

  static release(...subpaths: string[]) {
    return new Paths('./postgres/release', ...subpaths);
  }

  static schema(...subpaths: string[]) {
    return new Paths('./postgres/schema', ...subpaths);
  }

  private readonly subpaths: string[];
  constructor(private root: string, ...subpaths: string[]) {
    this.subpaths = subpaths;
  }

  asRelative() {
    return path.join(this.root, ...this.subpaths);
  }

  asAbsolute() {
    return this.toString();
  }

  toString() {
    return path.resolve(this.root, ...this.subpaths);
  }
}