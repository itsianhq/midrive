import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

type NameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialValue: string
  submitLabel: string
  /** Pre-select the name without its extension (for renaming files). */
  selectBaseName?: boolean
  onSubmit: (name: string) => Promise<unknown>
}

/** Single text-field dialog used for "New folder" and "Rename". */
export function NameDialog(props: NameDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {props.open && <NameForm key={props.initialValue} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function NameForm({
  onOpenChange,
  title,
  initialValue,
  submitLabel,
  selectBaseName,
  onSubmit,
}: NameDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [pending, setPending] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Focus and pre-select the name once when the dialog opens. (An inline
  // callback ref would re-run on every keystroke and re-select the text.)
  useEffect(() => {
    const dot = initialValue.lastIndexOf(".")
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(
        0,
        selectBaseName && dot > 0 ? dot : initialValue.length
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [initialValue, selectBaseName])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const name = value.trim()
    if (!name) return
    setPending(true)
    try {
      await onSubmit(name)
      onOpenChange(false)
    } catch {
      // error already surfaced by the mutation cache
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={255}
      />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || !value.trim()}>
          {pending && <Spinner />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
