import React, { useState } from 'react'
import { useProtocols } from './hooks/useProtocols'
import ProtocolList from './components/ProtocolList'
import ProtocolEditor from './components/ProtocolEditor'

export default function App() {
  const { protocols, createProtocol, updateProtocol, deleteProtocol, duplicateProtocol } = useProtocols()
  const [activeId, setActiveId] = useState(null)

  const handleCreate = () => {
    const id = createProtocol()
    setActiveId(id)
  }

  const activeProtocol = protocols.find(p => p.id === activeId)

  if (activeId && activeProtocol) {
    return (
      <ProtocolEditor
        protocol={activeProtocol}
        onUpdate={updateProtocol}
        onBack={() => setActiveId(null)}
      />
    )
  }

  return (
    <ProtocolList
      protocols={protocols}
      onCreate={handleCreate}
      onOpen={setActiveId}
      onDelete={deleteProtocol}
      onDuplicate={duplicateProtocol}
    />
  )
}
