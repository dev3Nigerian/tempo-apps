import { describe, expect, it } from 'vitest'
import { Hex } from 'ox'
import {
	parseBoundaryOutcomeParticipants,
	normalizePublicKey,
} from '#lib/domain/onchain-dkg'

function appendVarInt(bytes: number[], value: bigint): void {
	let remaining = value
	while (true) {
		const current = Number(remaining & 0x7fn)
		remaining >>= 7n
		if (remaining === 0n) {
			bytes.push(current)
			return
		}
		bytes.push(current | 0x80)
	}
}

function appendU32(bytes: number[], value: number): void {
	bytes.push(
		(value >>> 24) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 8) & 0xff,
		value & 0xff,
	)
}

function appendBytes(bytes: number[], value: Uint8Array): void {
	for (const b of value) {
		bytes.push(b)
	}
}

function appendOrderedSet(bytes: number[], keys: string[]): void {
	appendVarInt(bytes, BigInt(keys.length))
	for (const key of keys) {
		appendBytes(bytes, Hex.toBytes(key as Hex.Hex))
	}
}

function keyBytes(value: number): string {
	const hex = value.toString(16).padStart(64, '0')
	return `0x${hex}` as const
}

function buildBoundaryPayload(params: {
	epoch: bigint
	dealers: string[]
	players: string[]
	revealed?: string[]
	nextPlayers: string[]
	coefCount?: number
	isNextFullDkg?: number
}): Hex.Hex {
	const bytes: number[] = []

	appendVarInt(bytes, params.epoch)

	appendBytes(bytes, new Uint8Array(32))

	bytes.push(0) // sharing mode
	appendU32(bytes, 1) // sharing total
	appendVarInt(bytes, BigInt(params.coefCount ?? 1))
	for (let i = 0; i < (params.coefCount ?? 1); i += 1) {
		appendBytes(bytes, new Uint8Array(96))
	}

	appendOrderedSet(bytes, params.dealers)
	appendOrderedSet(bytes, params.players)
	appendOrderedSet(bytes, params.revealed ?? [])
	appendOrderedSet(bytes, params.nextPlayers)
	bytes.push(params.isNextFullDkg ?? 1)

	return Hex.fromBytes(Uint8Array.from(bytes))
}

function mutatePayloadLastByte(payload: Hex.Hex, byteValue: number): Hex.Hex {
	const bytes = Hex.toBytes(payload)
	bytes[bytes.length - 1] = byteValue
	return Hex.fromBytes(bytes)
}

describe('parseBoundaryOutcomeParticipants', () => {
	it('extracts the player set from a valid boundary payload', () => {
		const dealerA = keyBytes(11)
		const dealerB = keyBytes(12)
		const playerA = keyBytes(17)
		const playerB = keyBytes(23)
		const nextPlayer = keyBytes(29)

		const payload = buildBoundaryPayload({
			epoch: 42n,
			dealers: [dealerA, dealerB],
			players: [playerA, playerB],
			nextPlayers: [nextPlayer],
		})

		const participants = parseBoundaryOutcomeParticipants(payload)

		expect(participants).toEqual(new Set([keyBytes(17), keyBytes(23)]))
	})

	it('returns null for empty payload', () => {
		expect(parseBoundaryOutcomeParticipants('0x')).toBeNull()
	})

	it('returns null when encoded sets are not strictly ordered', () => {
		const payload = buildBoundaryPayload({
			epoch: 77n,
			dealers: [keyBytes(11)],
			// Intentionally reversed player order to violate ordered set rules.
			players: [keyBytes(23), keyBytes(17)],
			nextPlayers: [keyBytes(31)],
		})

		expect(parseBoundaryOutcomeParticipants(payload)).toBeNull()
	})

	it('returns null for malformed bool marker', () => {
		const payload = buildBoundaryPayload({
			epoch: 88n,
			dealers: [keyBytes(11)],
			players: [keyBytes(17)],
			nextPlayers: [keyBytes(23)],
		})
		const invalidPayload = mutatePayloadLastByte(payload, 2)

		expect(parseBoundaryOutcomeParticipants(invalidPayload)).toBeNull()
	})
})

describe('normalizePublicKey', () => {
	it('normalizes missing 0x prefix and pads short keys', () => {
		expect(normalizePublicKey('abc')).toBe(`0x${'0'.repeat(61)}abc`)
	})

	it('lowercases and preserves existing prefix', () => {
		expect(normalizePublicKey('0xAbCd')).toBe(`0x${'0'.repeat(60)}abcd`)
	})

	it('returns null when missing', () => {
		expect(normalizePublicKey(undefined)).toBeNull()
	})
})
