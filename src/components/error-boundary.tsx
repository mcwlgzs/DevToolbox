import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CircleAlertIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * 根级错误边界。
 *
 * 23 个工具里任何一个在渲染期抛错（例如某个解析器遇到没考虑到的输入），
 * 没有边界时 React 会卸载整棵树，用户看到的是一片白。
 * 这里至少把「哪个组件崩了 + 怎么恢复」显示出来，并且不影响切换到别的工具。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 保留在控制台，方便用户反馈时贴出来
    console.error('工具渲染出错：', error, info.componentStack)
  }

  private readonly reset = () => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex flex-col gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-center gap-2 text-destructive">
          <CircleAlertIcon className="size-4" />
          <h1 className="text-base font-semibold">这个工具在渲染时出错了</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          其他工具仍然可以正常使用。可以先「重试」，或者从左侧（窄屏是顶栏菜单）切换到别的工具。
        </p>
        <pre className="scrollbar-thin overflow-x-auto rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-xs break-all whitespace-pre-wrap">
          {error.message || String(error)}
        </pre>
        <div>
          <Button variant="outline" size="sm" onClick={this.reset}>
            <RotateCcwIcon />
            重试
          </Button>
        </div>
      </div>
    )
  }
}
