"use client";
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import styles from './ChatWidget.module.css';

export default function ChatWidget({ embedded = false }) {
    const [isOpen, setIsOpen] = useState(embedded); // Open by default if embedded
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hola, soy tu Arquitecto Virtual. Puedo responder preguntas sobre las normativas cargadas. ¿En qué te ayudo?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen]);

    useEffect(() => {
        if (embedded) setIsOpen(true);
    }, [embedded]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [...messages, userMsg] })
            });

            if (!res.ok) throw new Error("Error en el servidor");

            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Lo siento, hubo un error al consultar al Arquitecto. Por favor intenta más tarde." }]);
        } finally {
            setLoading(false);
        }
    };

    if (embedded) {
        return (
            <div className={styles.embeddedChat}>
                <div className={styles.header}>
                    <div className={styles.headerTitle}>
                        <Bot size={20} className="mr-2" />
                        <span>Asistente Normativo</span>
                    </div>
                </div>

                <div className={styles.messages}>
                    {messages.map((m, i) => (
                        <div key={i} className={`${styles.messageRow} ${m.role === 'user' ? styles.userRow : styles.botRow}`}>
                            <div className={`${styles.bubble} ${m.role === 'user' ? styles.userBubble : styles.botBubble}`}>
                                {m.role === 'assistant' ? (
                                    <ReactMarkdown>{m.content}</ReactMarkdown>
                                ) : (
                                    <p>{m.content}</p>
                                )}
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div className={`${styles.messageRow} ${styles.botRow}`}>
                            <div className={`${styles.bubble} ${styles.botBubble}`}>
                                <span className={styles.typing}>...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSubmit} className={styles.inputArea}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Pregunta sobre normativas..."
                        className={styles.input}
                    />
                    <button type="submit" disabled={loading} className={styles.sendBtn}>
                        <Send size={18} />
                    </button>
                </form>
            </div>
        );
    }

    return (
        <>
            {/* Floating Button — solo visible cuando el chat está CERRADO */}
            {!isOpen && (
                <button
                    className={styles.floatBtn}
                    onClick={() => setIsOpen(true)}
                    aria-label="Abrir Chat"
                >
                    <MessageCircle size={28} />
                </button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <div className={styles.chatWindow}>
                    <div className={styles.header}>
                        <div className={styles.headerTitle}>
                            <Bot size={20} className="mr-2" />
                            <span>Asistente Normativo</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className={styles.closeBtn}><X size={16} /></button>
                    </div>

                    <div className={styles.messages}>
                        {messages.map((m, i) => (
                            <div key={i} className={`${styles.messageRow} ${m.role === 'user' ? styles.userRow : styles.botRow}`}>
                                <div className={`${styles.bubble} ${m.role === 'user' ? styles.userBubble : styles.botBubble}`}>
                                    {m.role === 'assistant' ? (
                                        <ReactMarkdown>{m.content}</ReactMarkdown>
                                    ) : (
                                        <p>{m.content}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className={`${styles.messageRow} ${styles.botRow}`}>
                                <div className={`${styles.bubble} ${styles.botBubble}`}>
                                    <span className={styles.typing}>...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form onSubmit={handleSubmit} className={styles.inputArea}>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Pregunta sobre normativas..."
                            className={styles.input}
                        />
                        <button type="submit" disabled={loading} className={styles.sendBtn}>
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}
