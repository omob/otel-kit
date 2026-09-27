// a ConfigMap key left blank arrives as "", which `??` would treat as a real value
export function readEnvironment(name: string, environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = environment[name]?.trim();

  return value ? value : undefined;
}
