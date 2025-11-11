import { useWebSocket } from '../../hooks/useWebSocket';

export function ConnectionStatus() {
  const { connected } = useWebSocket();

  return (
    <div className="fixed bottom-4 right-4">
      <div
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg
          ${connected ? 'bg-green-500 text-white' : 'bg-red-500 text-white animate-pulse'}
        `}
      >
        <div
          className={`w-2 h-2 rounded-full ${connected ? 'bg-white' : 'bg-white animate-pulse'}`}
        />
        <span className="text-sm font-medium">{connected ? 'Connected' : 'Reconnecting...'}</span>
      </div>
    </div>
  );
}
