import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                "kearney-gold": "#C8922A",
                "kearney-blue": "#003366",
            },
            fontFamily: {
                serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
                mono: ["JetBrains Mono", "Fira Code", "monospace"],
            },
        },
    },
    plugins: [],
};

export default config;
