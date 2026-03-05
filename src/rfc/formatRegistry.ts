/**
 * Format registry describing all JSON Schema formats
 * with their RFC source, ABNF grammar fragments,
 * known edge cases, and validator pitfalls.
 */

export interface FormatEdgeCase {
  input: string;
  valid: boolean;
  description: string;
}

export interface FormatSpec {
  name: string;
  rfc: string;
  grammar: string;
  edgeCases: FormatEdgeCase[];
  description: string;
  category: 'string' | 'numeric' | 'network' | 'temporal';
}

const EMAIL_GRAMMAR = `
addr-spec     = local-part "@" domain
local-part    = dot-atom / quoted-string
dot-atom      = 1*atext *("." 1*atext)
quoted-string = DQUOTE *qcontent DQUOTE
domain        = dot-atom / domain-literal
domain-literal = "[" *dtext "]"
atext         = ALPHA / DIGIT / "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "/" / "=" / "?" / "^" / "_" / "\`" / "{" / "|" / "}" / "~"
`.trim();

const URI_GRAMMAR = `
URI           = scheme ":" hier-part [ "?" query ] [ "#" fragment ]
hier-part     = "//" authority path-abempty / path-absolute / path-rootless / path-empty
scheme        = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )
authority     = [ userinfo "@" ] host [ ":" port ]
host          = IP-literal / IPv4address / reg-name
IP-literal    = "[" ( IPv6address / IPvFuture ) "]"
port          = *DIGIT
path-abempty  = *( "/" segment )
query         = *( pchar / "/" / "?" )
fragment      = *( pchar / "/" / "?" )
`.trim();

const HOSTNAME_GRAMMAR = `
hostname      = *( domainlabel "." ) toplabel [ "." ]
domainlabel   = alphanum / alphanum *( alphanum / "-" ) alphanum
toplabel      = ALPHA / ALPHA *( alphanum / "-" ) alphanum
`.trim();

const IPV4_GRAMMAR = `
IPv4address   = dec-octet "." dec-octet "." dec-octet "." dec-octet
dec-octet     = DIGIT / %x31-39 DIGIT / "1" 2DIGIT / "2" %x30-34 DIGIT / "25" %x30-35
`.trim();

const IPV6_GRAMMAR = `
IPv6address   =                            6( h16 ":" ) ls32
              /                       "::" 5( h16 ":" ) ls32
              / [               h16 ] "::" 4( h16 ":" ) ls32
              / [ *1( h16 ":" ) h16 ] "::" 3( h16 ":" ) ls32
              / [ *2( h16 ":" ) h16 ] "::" 2( h16 ":" ) ls32
              / [ *3( h16 ":" ) h16 ] "::"    h16 ":"   ls32
              / [ *4( h16 ":" ) h16 ] "::"              ls32
              / [ *5( h16 ":" ) h16 ] "::"              h16
              / [ *6( h16 ":" ) h16 ] "::"
h16           = 1*4HEXDIG
ls32          = ( h16 ":" h16 ) / IPv4address
`.trim();

const DATETIME_GRAMMAR = `
date-time     = full-date "T" full-time
full-date     = date-fullyear "-" date-month "-" date-mday
date-fullyear = 4DIGIT
date-month    = 2DIGIT
date-mday     = 2DIGIT
full-time     = partial-time time-offset
partial-time  = time-hour ":" time-minute ":" time-second [time-secfrac]
time-hour     = 2DIGIT
time-minute   = 2DIGIT
time-second   = 2DIGIT
time-secfrac  = "." 1*DIGIT
time-offset   = "Z" / time-numoffset
time-numoffset = ("+" / "-") time-hour ":" time-minute
`.trim();

const DATE_GRAMMAR = `
full-date     = date-fullyear "-" date-month "-" date-mday
date-fullyear = 4DIGIT
date-month    = 2DIGIT
date-mday     = 2DIGIT
`.trim();

const TIME_GRAMMAR = `
full-time     = partial-time time-offset
partial-time  = time-hour ":" time-minute ":" time-second [time-secfrac]
time-hour     = 2DIGIT
time-minute   = 2DIGIT
time-second   = 2DIGIT
time-secfrac  = "." 1*DIGIT
time-offset   = "Z" / time-numoffset
time-numoffset = ("+" / "-") time-hour ":" time-minute
`.trim();

const DURATION_GRAMMAR = `
duration      = "P" (dur-date / dur-time / dur-week)
dur-date      = dur-day [dur-time]
dur-time      = "T" (dur-hour / dur-minute / dur-second)
dur-week      = 1*DIGIT "W"
dur-day       = 1*DIGIT "D"
dur-hour      = 1*DIGIT "H" [dur-minute]
dur-minute    = 1*DIGIT "M" [dur-second]
dur-second    = 1*DIGIT "S"
`.trim();

const UUID_GRAMMAR = `
UUID          = time-low "-" time-mid "-" time-high-and-version "-" clock-seq-and-reserved clock-seq-low "-" node
time-low      = 4hexOctet
time-mid      = 2hexOctet
time-high-and-version = 2hexOctet
clock-seq-and-reserved = hexOctet
clock-seq-low = hexOctet
node          = 6hexOctet
hexOctet      = 2HEXDIG
`.trim();

const IRI_GRAMMAR = `
IRI           = scheme ":" ihier-part [ "?" iquery ] [ "#" ifragment ]
ihier-part    = "//" iauthority ipath-abempty / ipath-absolute / ipath-rootless / ipath-empty
`.trim();

const JSON_POINTER_GRAMMAR = `
json-pointer  = *( "/" reference-token )
reference-token = *( unescaped / escaped )
escaped       = "~" ( "0" / "1" )
unescaped     = %x00-2E / %x30-7D / %x7F-10FFFF
`.trim();

const REGEX_GRAMMAR = `
regex         = *( char / metachar / quantifier / group / charclass )
metachar      = "." / "^" / "$" / "\\" special
quantifier    = ( "*" / "+" / "?" ) [ "?" ]
group         = "(" regex ")"
charclass     = "[" ["^"] *classitem "]"
`.trim();

export const FORMAT_REGISTRY: Record<string, FormatSpec> = {
  email: {
    name: 'email',
    rfc: 'RFC 5321/5322',
    grammar: EMAIL_GRAMMAR,
    description: 'Internet email address',
    category: 'string',
    edgeCases: [
      { input: 'user@example.com', valid: true, description: 'simple valid email' },
      { input: '"user"@example.com', valid: true, description: 'quoted local part' },
      { input: 'user+tag@example.com', valid: true, description: 'plus addressing' },
      { input: 'user.name@example.com', valid: true, description: 'dotted local part' },
      { input: 'user@sub.example.com', valid: true, description: 'subdomain' },
      { input: 'user@[192.168.1.1]', valid: true, description: 'domain literal with IPv4' },
      { input: 'very.long.local.part.with.many.dots@example.com', valid: true, description: 'long dotted local' },
      { input: '"quoted..double"@example.com', valid: true, description: 'quoted double dot' },
      { input: 'user@123.123.123.123', valid: true, description: 'numeric domain' },
      { input: '', valid: false, description: 'empty string' },
      { input: 'user@', valid: false, description: 'missing domain' },
      { input: '@example.com', valid: false, description: 'missing local part' },
      { input: 'user@invalid_domain', valid: false, description: 'underscore in domain' },
      { input: 'user name@example.com', valid: false, description: 'unquoted space in local' },
      { input: 'user@.example.com', valid: false, description: 'leading dot in domain' },
      { input: 'user@example..com', valid: false, description: 'double dot in domain' },
      { input: '.user@example.com', valid: false, description: 'leading dot in local' },
      { input: 'user.@example.com', valid: false, description: 'trailing dot in local' },
      { input: 'user@@example.com', valid: false, description: 'double at sign' },
      { input: 'a'.repeat(65) + '@example.com', valid: false, description: 'local part too long (>64)' },
    ],
  },

  'idn-email': {
    name: 'idn-email',
    rfc: 'RFC 6531',
    grammar: EMAIL_GRAMMAR,
    description: 'Internationalized email address',
    category: 'string',
    edgeCases: [
      { input: 'user@example.com', valid: true, description: 'ASCII email' },
      { input: 'user@bücher.example', valid: true, description: 'internationalized domain' },
      { input: 'münchen@example.com', valid: true, description: 'internationalized local' },
      { input: '', valid: false, description: 'empty string' },
      { input: '@example.com', valid: false, description: 'missing local' },
    ],
  },

  uri: {
    name: 'uri',
    rfc: 'RFC 3986',
    grammar: URI_GRAMMAR,
    description: 'Uniform Resource Identifier',
    category: 'string',
    edgeCases: [
      { input: 'https://example.com', valid: true, description: 'simple HTTPS URI' },
      { input: 'http://example.com/path?q=1#frag', valid: true, description: 'full URI with query and fragment' },
      { input: 'ftp://user:pass@host:21/file', valid: true, description: 'FTP URI with userinfo and port' },
      { input: 'urn:isbn:0451450523', valid: true, description: 'URN' },
      { input: 'mailto:user@example.com', valid: true, description: 'mailto URI' },
      { input: 'http://[::1]/path', valid: true, description: 'IPv6 host' },
      { input: 'http://192.168.1.1:8080/', valid: true, description: 'IPv4 host with port' },
      { input: 'scheme+custom://host', valid: true, description: 'custom scheme with plus' },
      { input: '', valid: false, description: 'empty string' },
      { input: '://missing-scheme', valid: false, description: 'missing scheme' },
      { input: 'http://', valid: false, description: 'scheme with empty authority' },
      { input: 'not a uri', valid: false, description: 'contains spaces' },
      { input: 'http://example.com/path with spaces', valid: false, description: 'unencoded spaces in path' },
    ],
  },

  'uri-reference': {
    name: 'uri-reference',
    rfc: 'RFC 3986',
    grammar: URI_GRAMMAR,
    description: 'URI or relative reference',
    category: 'string',
    edgeCases: [
      { input: 'https://example.com', valid: true, description: 'absolute URI' },
      { input: '/path/to/resource', valid: true, description: 'relative path' },
      { input: '../parent', valid: true, description: 'relative parent path' },
      { input: '#fragment', valid: true, description: 'fragment only' },
      { input: '', valid: true, description: 'empty string (valid relative ref)' },
      { input: 'http://example.com/path with spaces', valid: false, description: 'unencoded spaces' },
    ],
  },

  'uri-template': {
    name: 'uri-template',
    rfc: 'RFC 6570',
    grammar: 'URI-Template = *( literals / expression )\nexpression = "{" [ operator ] variable-list "}"\noperator = op-level2 / op-level3 / op-reserve',
    description: 'URI Template',
    category: 'string',
    edgeCases: [
      { input: 'https://example.com/{id}', valid: true, description: 'simple template' },
      { input: '/search{?q,lang}', valid: true, description: 'query expansion' },
      { input: '/path{/segments*}', valid: true, description: 'path segments explosion' },
      { input: '{+path}', valid: true, description: 'reserved expansion' },
      { input: '', valid: true, description: 'empty string' },
    ],
  },

  iri: {
    name: 'iri',
    rfc: 'RFC 3987',
    grammar: IRI_GRAMMAR,
    description: 'Internationalized Resource Identifier',
    category: 'string',
    edgeCases: [
      { input: 'https://example.com/rösource', valid: true, description: 'IRI with Unicode path' },
      { input: 'https://example.com', valid: true, description: 'plain ASCII IRI' },
      { input: '', valid: false, description: 'empty string' },
    ],
  },

  'iri-reference': {
    name: 'iri-reference',
    rfc: 'RFC 3987',
    grammar: IRI_GRAMMAR,
    description: 'IRI or relative IRI reference',
    category: 'string',
    edgeCases: [
      { input: '/résource', valid: true, description: 'relative IRI' },
      { input: 'https://example.com', valid: true, description: 'absolute IRI' },
      { input: '', valid: true, description: 'empty string' },
    ],
  },

  hostname: {
    name: 'hostname',
    rfc: 'RFC 1123',
    grammar: HOSTNAME_GRAMMAR,
    description: 'Internet hostname',
    category: 'network',
    edgeCases: [
      { input: 'example.com', valid: true, description: 'simple hostname' },
      { input: 'sub.example.com', valid: true, description: 'subdomain' },
      { input: 'host-name', valid: true, description: 'hyphenated' },
      { input: 'a', valid: true, description: 'single character' },
      { input: 'EXAMPLE.COM', valid: true, description: 'uppercase' },
      { input: '123.example.com', valid: true, description: 'numeric first label' },
      { input: '', valid: false, description: 'empty string' },
      { input: '-host', valid: false, description: 'leading hyphen' },
      { input: 'host-', valid: false, description: 'trailing hyphen' },
      { input: 'host..name', valid: false, description: 'double dot' },
      { input: 'a'.repeat(64), valid: false, description: 'label too long (>63)' },
      { input: ('a'.repeat(63) + '.').repeat(4) + 'a', valid: false, description: 'total too long (>253)' },
    ],
  },

  'idn-hostname': {
    name: 'idn-hostname',
    rfc: 'RFC 5890',
    grammar: HOSTNAME_GRAMMAR,
    description: 'Internationalized hostname',
    category: 'network',
    edgeCases: [
      { input: 'example.com', valid: true, description: 'ASCII hostname' },
      { input: 'münchen.de', valid: true, description: 'internationalized label' },
      { input: '', valid: false, description: 'empty string' },
    ],
  },

  ipv4: {
    name: 'ipv4',
    rfc: 'RFC 2673',
    grammar: IPV4_GRAMMAR,
    description: 'IPv4 address',
    category: 'network',
    edgeCases: [
      { input: '192.168.1.1', valid: true, description: 'typical private address' },
      { input: '0.0.0.0', valid: true, description: 'all zeros' },
      { input: '255.255.255.255', valid: true, description: 'broadcast' },
      { input: '127.0.0.1', valid: true, description: 'loopback' },
      { input: '1.2.3.4', valid: true, description: 'simple address' },
      { input: '', valid: false, description: 'empty string' },
      { input: '256.1.1.1', valid: false, description: 'octet > 255' },
      { input: '1.2.3', valid: false, description: 'too few octets' },
      { input: '1.2.3.4.5', valid: false, description: 'too many octets' },
      { input: '01.02.03.04', valid: false, description: 'leading zeros' },
      { input: '1.2.3.4/24', valid: false, description: 'CIDR notation' },
      { input: '-1.0.0.0', valid: false, description: 'negative octet' },
    ],
  },

  ipv6: {
    name: 'ipv6',
    rfc: 'RFC 4291',
    grammar: IPV6_GRAMMAR,
    description: 'IPv6 address',
    category: 'network',
    edgeCases: [
      { input: '::1', valid: true, description: 'loopback' },
      { input: '::', valid: true, description: 'unspecified' },
      { input: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', valid: true, description: 'full form' },
      { input: '2001:db8::1', valid: true, description: 'abbreviated' },
      { input: '::ffff:192.168.1.1', valid: true, description: 'IPv4-mapped' },
      { input: 'fe80::1%eth0', valid: true, description: 'link-local with zone ID' },
      { input: '', valid: false, description: 'empty string' },
      { input: ':::', valid: false, description: 'triple colon' },
      { input: '1:2:3:4:5:6:7:8:9', valid: false, description: 'too many groups' },
      { input: '12345::1', valid: false, description: 'group > 4 hex digits' },
      { input: 'gggg::1', valid: false, description: 'invalid hex chars' },
    ],
  },

  'date-time': {
    name: 'date-time',
    rfc: 'RFC 3339',
    grammar: DATETIME_GRAMMAR,
    description: 'Date and time',
    category: 'temporal',
    edgeCases: [
      { input: '2023-01-15T12:30:00Z', valid: true, description: 'UTC date-time' },
      { input: '2023-01-15T12:30:00+05:30', valid: true, description: 'with positive offset' },
      { input: '2023-01-15T12:30:00-08:00', valid: true, description: 'with negative offset' },
      { input: '2023-01-15T12:30:00.123Z', valid: true, description: 'with fractional seconds' },
      { input: '2023-01-15t12:30:00z', valid: true, description: 'lowercase t and z' },
      { input: '2023-02-28T23:59:59Z', valid: true, description: 'end of non-leap February' },
      { input: '2024-02-29T00:00:00Z', valid: true, description: 'leap day' },
      { input: '2023-12-31T23:59:60Z', valid: true, description: 'leap second' },
      { input: '', valid: false, description: 'empty string' },
      { input: '2023-01-15', valid: false, description: 'date only (no time)' },
      { input: '12:30:00Z', valid: false, description: 'time only (no date)' },
      { input: '2023-13-01T00:00:00Z', valid: false, description: 'month > 12' },
      { input: '2023-01-32T00:00:00Z', valid: false, description: 'day > 31' },
      { input: '2023-02-29T00:00:00Z', valid: false, description: 'Feb 29 in non-leap year' },
      { input: '2023-01-15T25:00:00Z', valid: false, description: 'hour > 23' },
      { input: '2023-01-15T12:60:00Z', valid: false, description: 'minute > 59' },
      { input: '2023-01-15T12:30:00', valid: false, description: 'missing timezone' },
    ],
  },

  date: {
    name: 'date',
    rfc: 'RFC 3339',
    grammar: DATE_GRAMMAR,
    description: 'Full date',
    category: 'temporal',
    edgeCases: [
      { input: '2023-01-15', valid: true, description: 'simple date' },
      { input: '2024-02-29', valid: true, description: 'leap day' },
      { input: '2023-12-31', valid: true, description: 'end of year' },
      { input: '', valid: false, description: 'empty string' },
      { input: '2023-13-01', valid: false, description: 'month > 12' },
      { input: '2023-00-01', valid: false, description: 'month = 0' },
      { input: '2023-01-32', valid: false, description: 'day > 31' },
      { input: '2023-02-29', valid: false, description: 'Feb 29 in non-leap year' },
      { input: '23-01-15', valid: false, description: 'two-digit year' },
    ],
  },

  time: {
    name: 'time',
    rfc: 'RFC 3339',
    grammar: TIME_GRAMMAR,
    description: 'Full time',
    category: 'temporal',
    edgeCases: [
      { input: '12:30:00Z', valid: true, description: 'UTC time' },
      { input: '12:30:00+05:30', valid: true, description: 'with offset' },
      { input: '12:30:00.123Z', valid: true, description: 'with fractional seconds' },
      { input: '23:59:59Z', valid: true, description: 'end of day' },
      { input: '00:00:00Z', valid: true, description: 'midnight' },
      { input: '', valid: false, description: 'empty string' },
      { input: '25:00:00Z', valid: false, description: 'hour > 23' },
      { input: '12:60:00Z', valid: false, description: 'minute > 59' },
      { input: '12:30:00', valid: false, description: 'missing timezone' },
    ],
  },

  duration: {
    name: 'duration',
    rfc: 'RFC 3339',
    grammar: DURATION_GRAMMAR,
    description: 'ISO 8601 duration',
    category: 'temporal',
    edgeCases: [
      { input: 'P1Y', valid: true, description: 'one year' },
      { input: 'P1M', valid: true, description: 'one month' },
      { input: 'P1D', valid: true, description: 'one day' },
      { input: 'PT1H', valid: true, description: 'one hour' },
      { input: 'PT1M', valid: true, description: 'one minute' },
      { input: 'PT1S', valid: true, description: 'one second' },
      { input: 'P1Y2M3DT4H5M6S', valid: true, description: 'full duration' },
      { input: 'P4W', valid: true, description: 'weeks' },
      { input: '', valid: false, description: 'empty string' },
      { input: '1Y', valid: false, description: 'missing P prefix' },
      { input: 'P', valid: false, description: 'P with no designator' },
      { input: 'PT', valid: false, description: 'PT with no value' },
    ],
  },

  uuid: {
    name: 'uuid',
    rfc: 'RFC 4122',
    grammar: UUID_GRAMMAR,
    description: 'UUID',
    category: 'string',
    edgeCases: [
      { input: '550e8400-e29b-41d4-a716-446655440000', valid: true, description: 'valid v4 UUID' },
      { input: '00000000-0000-0000-0000-000000000000', valid: true, description: 'nil UUID' },
      { input: 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', valid: true, description: 'max UUID uppercase' },
      { input: '550e8400-e29b-41d4-a716-446655440000'.toUpperCase(), valid: true, description: 'uppercase' },
      { input: '', valid: false, description: 'empty string' },
      { input: '550e8400-e29b-41d4-a716', valid: false, description: 'too short' },
      { input: '550e8400-e29b-41d4-a716-44665544000g', valid: false, description: 'invalid hex char' },
      { input: '550e8400e29b41d4a716446655440000', valid: false, description: 'missing hyphens' },
    ],
  },

  'json-pointer': {
    name: 'json-pointer',
    rfc: 'RFC 6901',
    grammar: JSON_POINTER_GRAMMAR,
    description: 'JSON Pointer',
    category: 'string',
    edgeCases: [
      { input: '', valid: true, description: 'empty string (root)' },
      { input: '/foo', valid: true, description: 'simple property' },
      { input: '/foo/bar', valid: true, description: 'nested property' },
      { input: '/foo/0', valid: true, description: 'array index' },
      { input: '/~0', valid: true, description: 'escaped tilde' },
      { input: '/~1', valid: true, description: 'escaped slash' },
      { input: '/a~0b', valid: true, description: 'tilde escape in key' },
      { input: 'no-slash', valid: false, description: 'missing leading slash' },
      { input: '/~2', valid: false, description: 'invalid escape sequence' },
    ],
  },

  'relative-json-pointer': {
    name: 'relative-json-pointer',
    rfc: 'RFC (draft)',
    grammar: 'relative-json-pointer = non-negative-integer ( "#" / json-pointer )',
    description: 'Relative JSON Pointer',
    category: 'string',
    edgeCases: [
      { input: '0', valid: true, description: 'current document' },
      { input: '1/foo', valid: true, description: 'one level up then into foo' },
      { input: '0#', valid: true, description: 'current key name' },
      { input: '2/bar/0', valid: true, description: 'two levels up into array' },
      { input: '', valid: false, description: 'empty string' },
      { input: '/foo', valid: false, description: 'absolute pointer (no prefix)' },
    ],
  },

  regex: {
    name: 'regex',
    rfc: 'ECMA-262',
    grammar: REGEX_GRAMMAR,
    description: 'ECMA-262 regular expression',
    category: 'string',
    edgeCases: [
      { input: '^[a-z]+$', valid: true, description: 'simple character class' },
      { input: '\\d{3}-\\d{4}', valid: true, description: 'digit shorthand with quantifier' },
      { input: '(foo|bar)', valid: true, description: 'alternation group' },
      { input: '.', valid: true, description: 'any character' },
      { input: '', valid: true, description: 'empty regex' },
      { input: '[', valid: false, description: 'unclosed bracket' },
      { input: '(', valid: false, description: 'unclosed paren' },
      { input: '*', valid: false, description: 'quantifier without target' },
    ],
  },
};

export function getFormatSpec(format: string): FormatSpec | undefined {
  return FORMAT_REGISTRY[format];
}

export function getSupportedFormats(): string[] {
  return Object.keys(FORMAT_REGISTRY).sort();
}

export function getFormatsByCategory(category: FormatSpec['category']): FormatSpec[] {
  return Object.values(FORMAT_REGISTRY)
    .filter((s) => s.category === category)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getAllEdgeCases(format: string): FormatEdgeCase[] {
  const spec = FORMAT_REGISTRY[format];
  if (!spec) return [];
  return spec.edgeCases;
}
