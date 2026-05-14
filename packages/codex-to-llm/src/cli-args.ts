export function createCliArgReader(args: string[]) {
  return {
    getArg(name: string, fallback?: string): string | undefined {
      const index = args.indexOf(name);
      if (index !== -1 && args[index + 1]) {
        return args[index + 1];
      }

      return fallback;
    },
    hasFlag(name: string): boolean {
      return args.includes(name);
    }
  };
}
