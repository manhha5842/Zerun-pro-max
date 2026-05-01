import { Globe, LogIn } from "lucide-react";
import type { PlatformFieldsProps } from "../../pages/accountForms";
import { InlineNote } from "../../pages/accountForms";

export function XAccountForm(_props: PlatformFieldsProps) {
  return (
    <>
      <InlineNote tone="info">
        <Globe aria-hidden size={14} />
        <span>
          X / Twitter đăng nhập qua trình duyệt riêng. Sau khi lưu tài khoản, Zerun mở cửa sổ X để bạn đăng nhập
          — mật khẩu không đi qua Zerun.
        </span>
      </InlineNote>
      <InlineNote tone="info">
        <LogIn aria-hidden size={14} />
        <span>
          Nếu X yêu cầu email, 2FA hoặc checkpoint, xử lý trực tiếp trong cửa sổ trình duyệt vừa mở. Sau đó quay
          lại Zerun và bấm <strong>Lưu session</strong>.
        </span>
      </InlineNote>
    </>
  );
}
