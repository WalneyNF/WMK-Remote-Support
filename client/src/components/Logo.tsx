// Identidade visual WMK: emblema compartilhado entre a interface e o README.
export function Logo({ size = 28 }: { size?: number }) {
  return <img src="/wmk-remote-support.svg" width={size} height={size} alt="WMK Remote Support" style={{ display: "block", objectFit: "contain" }} />;
}
