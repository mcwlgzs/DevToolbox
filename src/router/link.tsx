import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { useRouter } from '@/router/context'

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }

/** 内部链接：拦截左键点击做客户端跳转，其余情况（中键、Ctrl+点击、爬虫抓取）保留原生行为。 */
export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  )
}
