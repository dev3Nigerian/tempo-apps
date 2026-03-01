import { getBlock } from 'wagmi/actions'
import { queryOptions } from '@tanstack/react-query'
import { isTestnet } from '#lib/env'
import {
	DEFAULT_BOUNDARY_LOOKBACK,
	KNOWN_EPOCH_LENGTH_BY_CHAIN_ID,
	parseBoundaryOutcomeParticipants,
	normalizePublicKey,
} from '#lib/domain/onchain-dkg'
import { getTempoChain, getWagmiConfig } from '#wagmi.config.ts'

const VALIDATOR_DIRECTORY_URL =
	'https://tempo-validator-directory.porto.workers.dev'

export type Validator = {
	validatorAddress: `0x${string}`
	name?: string
	publicKey?: `0x${string}`
	active?: boolean
	isRegisteredActive?: boolean
}

type ValidatorDirectoryResponse = {
	network: string
	validators: Validator[]
	updatedAt: string | null
}

const getValidatorNetwork = () => (isTestnet() ? 'testnet' : 'mainnet')

function getKnownEpochLength(): bigint | null {
	const chain = getTempoChain()
	return KNOWN_EPOCH_LENGTH_BY_CHAIN_ID[chain.id] ?? null
}

function getEstimatedBoundaryHeight(
	latestHeight: bigint,
	epochLength: bigint,
): bigint {
	if (epochLength <= 0n) return latestHeight
	if (latestHeight + 1n < epochLength) return 0n
	return ((latestHeight + 1n) / epochLength) * epochLength - 1n
}

async function getBoundaryParticipants(
	latestHeight: bigint,
): Promise<Set<`0x${string}`> | null> {
	const config = getWagmiConfig()
	const knownEpochLength = getKnownEpochLength()
	const candidateHeights = new Set<bigint>()
	candidateHeights.add(latestHeight)

	if (knownEpochLength !== null) {
		const estimatedBoundary = getEstimatedBoundaryHeight(
			latestHeight,
			knownEpochLength,
		)
		candidateHeights.add(estimatedBoundary)
		candidateHeights.add(estimatedBoundary - knownEpochLength)
		candidateHeights.add(estimatedBoundary - knownEpochLength * 2n)
	}

	const parseAtHeight = async (
		height: bigint,
	): Promise<Set<`0x${string}`> | null> => {
		if (height < 0n) return null
		const block = await getBlock(config, { blockNumber: height })
		return parseBoundaryOutcomeParticipants(block.extraData)
	}

	for (const candidate of candidateHeights) {
		if (candidate < 0n || candidate > latestHeight) {
			continue
		}
		const participants = await parseAtHeight(candidate).catch(() => null)
		if (participants) {
			return participants
		}
	}

	const fallbackLookback = knownEpochLength
		? knownEpochLength * 2n
		: DEFAULT_BOUNDARY_LOOKBACK
	const minHeight =
		latestHeight > fallbackLookback ? latestHeight - fallbackLookback : 0n

	for (let height = latestHeight; height >= minHeight; height -= 1n) {
		if (candidateHeights.has(height)) continue
		const participants = await parseAtHeight(height).catch(() => null)
		if (participants) {
			return participants
		}
	}

	return null
}

function deriveValidatorStatuses(
	validators: Validator[],
	participants: Set<`0x${string}`> | null,
): Validator[] {
	if (!participants) {
		return validators
	}

	return validators.map((validator) => {
		const normalizedKey = normalizePublicKey(validator.publicKey)
		const isEpochActive = normalizedKey
			? participants.has(normalizedKey)
			: false
		const isRegisteredActive = Boolean(validator.active)

		return {
			...validator,
			active: isEpochActive,
			isRegisteredActive,
		}
	})
}

export function validatorsQueryOptions() {
	const network = getValidatorNetwork()
	return queryOptions({
		queryKey: ['validators', network],
		queryFn: async () => {
			const url = `${VALIDATOR_DIRECTORY_URL}/validators?network=${network}`
			const config = getWagmiConfig()
			const [response, latestBlock] = await Promise.all([
				fetch(url),
				getBlock(config),
			])

			if (!response.ok) {
				throw new Error(`Failed to fetch validators: ${response.status}`)
			}
			const data = (await response.json()) as ValidatorDirectoryResponse
			const participants = await getBoundaryParticipants(latestBlock.number)

			return deriveValidatorStatuses(data.validators, participants)
		},
		staleTime: 60_000,
	})
}
