import * as React from 'react'
import { cx } from '#lib/css'
import { getTempoEnv } from '#lib/env'
import ChevronDownIcon from '~icons/lucide/chevron-down'

const networks = [
	{ label: 'Testnet', href: 'https://explore.testnet.tempo.xyz' },
	{ label: 'Mainnet', href: 'https://explore.mainnet.tempo.xyz' },
] as const

export function NetworkToggle(props: NetworkToggle.Props): React.JSX.Element {
	const { className } = props
	const [open, setOpen] = React.useState(false)
	const ref = React.useRef<HTMLDivElement>(null)
	const activeIndex = getTempoEnv() === 'presto' ? 1 : 0
	const active = networks[activeIndex]

	React.useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	return (
		<div ref={ref} className={cx('relative', className)}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-0.5 rounded-full border border-base-border bg-surface px-1.5 py-px text-[10px] font-medium text-secondary hover:text-primary press-down cursor-pointer transition-colors"
			>
				<span>{active.label}</span>
				<ChevronDownIcon
					className={cx(
						'size-[10px] transition-transform',
						open && 'rotate-180',
					)}
				/>
			</button>
			{open && (
				<div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-base-border bg-base-plane shadow-lg p-0.5 min-w-[90px]">
					{networks.map((network, i) => (
						<a
							key={network.label}
							href={network.href}
							className={cx(
								'block px-2.5 py-1 text-[11px] font-medium rounded-md press-down transition-colors',
								i === activeIndex
									? 'text-primary bg-base-border/40'
									: 'text-secondary hover:text-primary hover:bg-base-border/30',
							)}
						>
							{network.label}
						</a>
					))}
				</div>
			)}
		</div>
	)
}

export declare namespace NetworkToggle {
	type Props = {
		className?: string | undefined
	}
}
