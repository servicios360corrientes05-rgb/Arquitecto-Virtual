import { Inter, Outfit } from "next/font/google";
import ChatWidget from "./components/ChatWidget";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata = {
  title: "Virtual Architect | AI Construction Feasibility",
  description: "Automated feasibility reports for real estate development.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className={`${inter.variable} ${outfit.variable} antialiased`}>
        {children}
        <ChatWidget />
      </body>
    </html >
  );
}
