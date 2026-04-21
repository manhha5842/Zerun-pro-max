import { FormEvent, useState } from "react";
import { Link2 } from "lucide-react";
import { apiPost } from "../api/client";
import { Button } from "../components/ui/Button";

export function ConvertLinkPage() {
  const [results, setResults] = useState<Array<any>>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const urls = String(form.get("urls") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const data = await apiPost<{ results: Array<any> }>("/links/convert", {
      urls,
      campaignId: form.get("campaignId")
    });
    setResults(data.results);
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Chuyển link</h1>
          <p className="page-subtitle">Dùng AccessTrade thật. Cần `ACCESSTRADE_API_KEY` và campaignId hợp lệ.</p>
        </div>
      </header>
      <section className="split">
        <form className="panel panel-pad" onSubmit={submit}>
          <label className="field">
            <span>Danh sách URL</span>
            <textarea name="urls" placeholder="https://shopee.vn/..." required />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Campaign ID</span>
            <input name="campaignId" placeholder="AccessTrade campaignId" />
          </label>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button icon={<Link2 aria-hidden />}>Chuyển link</Button>
          </div>
        </form>
        <div className="panel panel-pad">
          <h2>Kết quả</h2>
          <table className="table">
            <tbody>
              {results.map((result) => (
                <tr key={result.original}>
                  <td>{result.original}</td>
                  <td>{result.converted ?? result.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
