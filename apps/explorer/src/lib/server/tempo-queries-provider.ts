import { QB, Tidx } from 'tidx.ts'

let _tidx: Tidx.create.ReturnValue | undefined

function getTidx() {
	if (_tidx) return _tidx

	_tidx = Tidx.create({
		basicAuth: process.env.TIDX_BASIC_AUTH,
		baseUrl: 'https://tidx.tempo.xyz',
	})

	_tidx.on('response', (res) => {
		if (!res.ok)
			res
				.clone()
				.text()
				.then((body) =>
					console.error(
						`[tidx:${res.status}]`,
						decodeURIComponent(res.url),
						body,
						`(auth=${process.env.TIDX_BASIC_AUTH ? 'set' : 'missing'})`,
					),
				)
	})

	return _tidx
}

export function tempoQueryBuilder(chainId: number) {
	return QB.from({ ...getTidx(), chainId })
}

export function tempoFastLookupQueryBuilder(chainId: number) {
	return QB.from({ ...getTidx(), chainId, engine: 'clickhouse' })
}

export { getTidx as tidx }
