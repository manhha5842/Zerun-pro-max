import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";

export type ThreadsLinkPreviewMode = "default" | "remove_preview" | "move_links_to_comment";
export type ThreadsSpoilerMode = "none" | "all_text";
export type ThreadsReplyControl = "everyone" | "accounts_you_follow" | "mentioned_only";

export type ThreadsPublishSettingsValue = {
  topicTag: string;
  linkPreviewMode: ThreadsLinkPreviewMode;
  spoilerMode: ThreadsSpoilerMode;
  spoilerMedia: boolean;
  ghostPost: boolean;
  replyControl: ThreadsReplyControl;
  enableReplyApprovals: boolean;
};

export const defaultThreadsPublishSettings: ThreadsPublishSettingsValue = {
  topicTag: "",
  linkPreviewMode: "default",
  spoilerMode: "none",
  spoilerMedia: false,
  ghostPost: false,
  replyControl: "everyone",
  enableReplyApprovals: false
};

export function normalizeThreadsPublishSettings(value?: Partial<ThreadsPublishSettingsValue> | null): ThreadsPublishSettingsValue {
  return {
    ...defaultThreadsPublishSettings,
    ...(value ?? {}),
    topicTag: value?.topicTag ?? ""
  };
}

export function buildThreadsPublishPayload(value: ThreadsPublishSettingsValue) {
  return {
    ...(value.topicTag.trim() ? { topicTag: value.topicTag.trim().replace(/^#/, "") } : {}),
    linkPreviewMode: value.linkPreviewMode,
    spoilerMode: value.spoilerMode,
    spoilerMedia: value.spoilerMedia,
    ghostPost: value.ghostPost,
    replyControl: value.replyControl,
    enableReplyApprovals: value.enableReplyApprovals
  };
}

export function ThreadsPublishSettings({
  value,
  onChange
}: {
  value: ThreadsPublishSettingsValue;
  onChange: (next: ThreadsPublishSettingsValue) => void;
}) {
  return (
    <div className="threads-settings-grid">
      <div className="field">
        <Label htmlFor="threads-topic-tag">Topic</Label>
        <Input
          id="threads-topic-tag"
          value={value.topicTag}
          onChange={(event) => onChange({ ...value, topicTag: event.target.value })}
          placeholder="Ví dụ: DealHot"
        />
      </div>

      <div className="field">
        <Label htmlFor="threads-link-preview">Preview link</Label>
        <Select
          id="threads-link-preview"
          value={value.linkPreviewMode}
          onChange={(event) => onChange({ ...value, linkPreviewMode: event.target.value as ThreadsLinkPreviewMode })}
        >
          <option value="default">Giữ mặc định</option>
          <option value="remove_preview">Gỡ preview</option>
          <option value="move_links_to_comment">Đưa link xuống comment</option>
        </Select>
      </div>

      <div className="field">
        <Label htmlFor="threads-spoiler-mode">Ẩn nội dung</Label>
        <Select
          id="threads-spoiler-mode"
          value={value.spoilerMode}
          onChange={(event) => onChange({ ...value, spoilerMode: event.target.value as ThreadsSpoilerMode })}
        >
          <option value="none">Không ẩn</option>
          <option value="all_text">Ẩn toàn bộ caption</option>
        </Select>
      </div>

      <div className="field">
        <Label htmlFor="threads-reply-control">Ai có thể trả lời</Label>
        <Select
          id="threads-reply-control"
          value={value.replyControl}
          onChange={(event) => onChange({ ...value, replyControl: event.target.value as ThreadsReplyControl })}
        >
          <option value="everyone">Mọi người</option>
          <option value="accounts_you_follow">Tài khoản đang theo dõi</option>
          <option value="mentioned_only">Chỉ tài khoản được nhắc</option>
        </Select>
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={value.spoilerMedia}
          onChange={(event) => onChange({ ...value, spoilerMedia: event.target.checked })}
        />
        <span>Ẩn media</span>
      </label>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={value.ghostPost}
          onChange={(event) => onChange({ ...value, ghostPost: event.target.checked })}
        />
        <span>Ghost post 24 giờ</span>
      </label>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={value.enableReplyApprovals}
          onChange={(event) => onChange({ ...value, enableReplyApprovals: event.target.checked })}
        />
        <span>Duyệt reply</span>
      </label>
    </div>
  );
}
