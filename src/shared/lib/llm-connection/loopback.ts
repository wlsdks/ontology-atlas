const IPV4_OCTET = /^(0|[1-9]\d{0,2})$/;

function isIpv4Loopback(host: string): boolean {
  const octets = host.split('.');
  return octets.length === 4 && octets[0] === '127' && octets.every((part) => IPV4_OCTET.test(part) && Number(part) <= 255);
}

function isIpv6Loopback(host: string): boolean {
  try {
    return new URL(`http://[${host}]/`).hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * Whether an address's host is this computer, decided as Rust's `is_loopback_authority` does
 * (`src-tauri/src/llm/local_endpoint.rs`): `localhost` in any case, an IPv4 address in 127.0.0.0/8
 * written as four plain decimal octets, or `::1` in any spelling. A name that only starts with a
 * loopback address, such as `127.0.0.1.example.com`, is another computer.
 */
export function isLoopbackAuthority(authority: string): boolean {
  const host = authority.startsWith('[')
    ? (authority.slice(1).split(']')[0] ?? '')
    : (authority.split(':')[0] ?? '');
  return host.toLowerCase() === 'localhost' || (authority.startsWith('[') ? isIpv6Loopback(host) : isIpv4Loopback(host));
}
