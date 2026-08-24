export function createCliArgReader(args: string[]) {
  return {
    getArg(name: string, fallback?: string): string | undefined {
      const index = args.indexOf(name);
      if (index !== -1 && args[index + 1]) {
        return args[index + 1];
      }

      return fallback;
    },
    getArgs(name: string): string[] {
      const values: string[] = [];
      for (let index = 0; index < args.length; index += 1) {
        if (args[index] === name && args[index + 1]) {
          values.push(args[index + 1]);
          index += 1;
        }
      }
      return values;
    },
    hasFlag(name: string): boolean {
      return args.includes(name);
    }
  };
}
