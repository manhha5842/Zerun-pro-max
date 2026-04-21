import { PageHeader } from "../components/common/PageHeader";
import { SectionCard } from "../components/common/SectionCard";

export function ImportPage() {
  return (
    <>
      <PageHeader title="Import thủ công" subtitle="Phần import file sẽ được nối vào giao diện sau. Hiện tại có thể dùng API để nhập dữ liệu." />
      <SectionCard title="API hiện có" description="Dùng endpoint này nếu cần import ngay trước khi UI hoàn thiện.">
        <p>Dùng API <code>POST /api/v1/import/upload</code> với multipart gồm <code>files[]</code> và <code>caption</code>.</p>
      </SectionCard>
    </>
  );
}
