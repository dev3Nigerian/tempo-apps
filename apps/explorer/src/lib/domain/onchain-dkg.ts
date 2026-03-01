import { Hex } from 'ox'

type ParserState = {
	bytes: Uint8Array
	offset: number
}

const MAX_VALIDATORS = 0xffff
const SUMMARY_SIZE = 32
const ED25519_PUBLIC_KEY_SIZE = 32
const G2_PUBLIC_KEY_SIZE = 96

const MAX_U64_BYTES = 10

function readByte(state: ParserState): number {
	if (state.offset >= state.bytes.length) {
		throw new Error('Unexpected end of byte stream')
	}

	return state.bytes[state.offset++]
}

function readVarInt(state: ParserState): bigint {
	let shift = 0n
	let value = 0n
	let bytesRead = 0

	while (true) {
		if (bytesRead >= MAX_U64_BYTES) {
			throw new Error('Varint is too long')
		}

		const byte = readByte(state)
		bytesRead += 1
		value |= BigInt(byte & 0x7f) << shift

		if ((byte & 0x80) === 0) {
			return value
		}

		shift += 7n
	}
}

function readUsize(state: ParserState, min: number, max: number): number {
	const value = readVarInt(state)
	if (value < BigInt(min) || value > BigInt(max)) {
		throw new Error('Invalid variable-length value')
	}
	if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error('Variable-length value is too large')
	}
	return Number(value)
}

function readU32(state: ParserState): number {
	if (state.offset + 4 > state.bytes.length) {
		throw new Error('Unexpected end of byte stream')
	}
	const value =
		(state.bytes[state.offset] << 24) |
		(state.bytes[state.offset + 1] << 16) |
		(state.bytes[state.offset + 2] << 8) |
		state.bytes[state.offset + 3]
	state.offset += 4
	return value >>> 0
}

function readBytes(state: ParserState, length: number): Uint8Array {
	if (state.offset + length > state.bytes.length) {
		throw new Error('Unexpected end of byte stream')
	}
	const out = state.bytes.subarray(state.offset, state.offset + length)
	state.offset += length
	return out
}

function readPublicKeySet(
	state: ParserState,
	min: number,
	max: number,
): Set<`0x${string}`> {
	const length = readUsize(state, min, max)
	const publicKeys = new Set<`0x${string}`>()
	let previousKey: `0x${string}` | undefined

	for (let index = 0; index < length; index += 1) {
		const key = Hex.fromBytes(
			readBytes(state, ED25519_PUBLIC_KEY_SIZE),
		) as `0x${string}`
		if (key.length !== 66) {
			throw new Error('Invalid public key length')
		}
		if (
			previousKey != null &&
			(previousKey >= key || key.length !== previousKey.length)
		) {
			throw new Error('Public keys are not strictly ordered')
		}
		publicKeys.add(key)
		previousKey = key
	}

	return publicKeys
}

function readSharedSet(state: ParserState): void {
	readByte(state) // sharing mode

	const total = readU32(state)
	if (total === 0 || total > MAX_VALIDATORS) {
		throw new Error('Invalid sharing total')
	}

	const coefCount = readUsize(state, 1, MAX_VALIDATORS)
	skipBytes(state, coefCount * G2_PUBLIC_KEY_SIZE)
}

function skipBytes(state: ParserState, length: number): void {
	if (state.offset + length > state.bytes.length) {
		throw new Error('Unexpected end of byte stream')
	}
	state.offset += length
}

function readBool(state: ParserState): boolean {
	const value = readByte(state)
	if (value !== 0 && value !== 1) {
		throw new Error('Invalid bool value')
	}
	return value === 1
}

function createParserState(extraData: Hex.Hex): ParserState {
	return {
		bytes: Hex.toBytes(extraData),
		offset: 0,
	}
}

function parseOutcomePlayersFromBytes(state: ParserState): Set<`0x${string}`> {
	// OnchainDkgOutcome:
	// epoch: u64 varint (skip)
	readVarInt(state)

	// summary: [u8; 32] (skip)
	skipBytes(state, SUMMARY_SIZE)

	// output: Summary + Sharing<MinSig, PublicKey> + dealers + players + revealed
	readSharedSet(state)
	readPublicKeySet(state, 1, MAX_VALIDATORS) // dealers
	const players = readPublicKeySet(state, 1, MAX_VALIDATORS) // players
	readPublicKeySet(state, 0, MAX_VALIDATORS) // revealed

	// next_players: ordered set of validators
	readPublicKeySet(state, 1, MAX_VALIDATORS)

	// is_next_full_dkg: bool
	readBool(state)

	return players
}

/**
 * Decode active validator public keys from a Tempo boundary block extraData payload.
 *
 * Boundary blocks serialize an `OnchainDkgOutcome` where the active participants
 * for that epoch are stored as `output.players()`.
 */
export function parseBoundaryOutcomeParticipants(
	extraData: Hex.Hex,
): Set<`0x${string}`> | null {
	try {
		if (!extraData || extraData === '0x') return null

		const state = createParserState(extraData)
		const players = parseOutcomePlayersFromBytes(state)
		return players
	} catch {
		return null
	}
}

/**
 * Cross-reference helper to safely compare directory/publicly configured keys with
 * DKG payload keys.
 */
export function normalizePublicKey(
	publicKey: string | undefined,
): `0x${string}` | null {
	if (!publicKey) return null
	const normalized = publicKey.toLowerCase()
	const withoutPrefix = normalized.startsWith('0x')
		? normalized.slice(2)
		: normalized
	return `0x${withoutPrefix.padStart(64, '0')}`
}

export const KNOWN_EPOCH_LENGTH_BY_CHAIN_ID = {
	4217: 21_600n,
	42431: 21_600n,
	42429: 302_400n,
	31318: 302_400n,
} as const

export const DEFAULT_BOUNDARY_LOOKBACK: bigint = 5_000n
