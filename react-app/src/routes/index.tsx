import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="md3-display-small text-on-surface mb-4">Bucket of Thoughts</h1>
        <p className="md3-body-large text-on-surface-variant mb-6">
          React + MD3 — foundation ready
        </p>
        <div className="flex gap-3 flex-wrap">
          <button className="md3-button-filled">Filled Button</button>
          <button className="md3-button-outlined">Outlined Button</button>
          <button className="md3-button-text">Text Button</button>
        </div>
      </div>
    </div>
  )
}
