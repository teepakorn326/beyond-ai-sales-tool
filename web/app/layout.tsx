export const metadata = { title: "Visa document checker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body style={{ margin: 0, background: "#F4F6F5", color: "#17272E" }}>{children}</body>
    </html>
  );
}
