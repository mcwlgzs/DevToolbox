import { MoonIcon, SunIcon, SunMoonIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useHydrated } from '@/hooks/use-hydrated'
import type { Theme } from '@/hooks/use-theme'

interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  // 预渲染阶段主题未知，用中性图标占位以避免 hydration 不匹配
  const hydrated = useHydrated()
  const next = theme === 'dark' ? '切换为浅色主题' : '切换为深色主题'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" onClick={onToggle} aria-label="切换主题">
          {hydrated ? theme === 'dark' ? <SunIcon /> : <MoonIcon /> : <SunMoonIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{next}</TooltipContent>
    </Tooltip>
  )
}
