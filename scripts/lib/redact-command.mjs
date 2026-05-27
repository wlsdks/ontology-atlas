const DEFAULT_SECRET_FLAGS = new Set([
  "--apple-id",
  "--keychain-profile",
  "--password",
]);

export function formatCommandForLog(command, args, options = {}) {
  const secretFlags = options.secretFlags ?? DEFAULT_SECRET_FLAGS;
  const redactedArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (secretFlags.has(arg)) {
      redactedArgs.push(arg);
      if (index + 1 < args.length) {
        redactedArgs.push("[redacted]");
        index += 1;
      }
      continue;
    }

    const equalsFlag = [...secretFlags].find((flag) => arg.startsWith(`${flag}=`));
    if (equalsFlag) {
      redactedArgs.push(`${equalsFlag}=[redacted]`);
      continue;
    }

    redactedArgs.push(arg);
  }

  return [command, ...redactedArgs].join(" ");
}
