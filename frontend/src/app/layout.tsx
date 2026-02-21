import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "ConsultDeck Studio",
    description: "GitHub → RAG → Voice Q&A Presentation System. Paste your repo, upload slides, and let AI answer client questions by voice.",
    keywords: ["RAG", "voice Q&A", "consulting", "presentation", "AI"],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="antialiased">{children}</body>
        </html>
    );
}
