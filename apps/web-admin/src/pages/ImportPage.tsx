export function ImportPage() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Import thủ công</h1>
          <p className="page-subtitle">Endpoint upload đã sẵn sàng; giao diện upload file sẽ nối ở bước polish sau Web Admin core.</p>
        </div>
      </header>
      <div className="panel panel-pad">
        <p>Dùng API `POST /api/v1/import/upload` với multipart gồm `files[]` và `caption`.</p>
      </div>
    </>
  );
}
