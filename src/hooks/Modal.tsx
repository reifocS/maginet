
// Simple inline Modal component
export function Modal({
    children,
    onClose,
    title,
    closeOnClickOutside,
}: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
    closeOnClickOutside: boolean;
}) {
    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
            }}
            onClick={closeOnClickOutside ? onClose : undefined}
        >
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    padding: '24px',
                    maxWidth: '500px',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    position: 'relative',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                        borderBottom: '1px solid #eee',
                        paddingBottom: '8px',
                    }}
                >
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{title}</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '0',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}