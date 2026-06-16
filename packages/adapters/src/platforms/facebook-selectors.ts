export type FacebookSelectorStrategy = "css" | "xpath" | "aria" | "role" | "text";

export type FacebookSelectorConfidence = "runtime-verified" | "fallback" | "hypothesis";

export type FacebookSelectorCandidate = {
  strategy: FacebookSelectorStrategy;
  value: string;
  confidence: FacebookSelectorConfidence;
  note?: string;
};

export type FacebookSelectorGroup = {
  description: string;
  candidates: FacebookSelectorCandidate[];
};

export type FacebookDomFingerprint = {
  description: string;
  observedHtml: string;
  stableSignals: string[];
  languageSensitiveSignals: string[];
  fallbackPlan: string[];
};

export const facebookObservedAutomationSelectors = {
  observedAt: "2026-06-11",
  browser: "Microsoft Edge via CDP debug port 9222",
  locale: "vi-VN",
  observedPage: {
    name: "Ngọc Trai",
    url: "https://www.facebook.com/nhaccuamongmer",
    assetId: "111084616949772"
  },
  selectorPolicy: {
    primaryRule: "Không dùng label text đơn lẻ làm selector chính cho automation production.",
    preferredOrder: [
      "DOM fingerprint: role + dialog scope + input attributes + enabled/visible state",
      "CSS/XPath scoped trong [role='dialog'] hoặc Page card hiện hành",
      "aria-label/text tiếng Việt đã runtime-verified",
      "English aria/text fallback khi account đổi ngôn ngữ",
      "Vision/screenshot fallback nếu DOM thay đổi mạnh"
    ],
    volatileSignalsToAvoidAsPrimary: [
      "Facebook generated class names như x1i10hfl/xjqpnuy",
      "tọa độ tuyệt đối",
      "text label đứng một mình ngoài dialog scope",
      "thứ tự index toàn trang nếu không có scope gần"
    ],
    seleniumPortingNotes: [
      "CSS selector có thể dùng trực tiếp với By.cssSelector.",
      "XPath có thể dùng trực tiếp với By.xpath.",
      "role/text/aria strategy là metadata; khi port sang Selenium hãy chuyển thành CSS/XPath tương ứng.",
      "Luôn validate element isDisplayed/isEnabled trước khi click.",
      "Sau upload media, chờ input accept đúng loại + preview/Next button enabled thay vì sleep cố định."
    ]
  },
  domFingerprints: {
    createPostDialog: {
      description: "Composer Page scoped theo role dialog; text title có thể đổi ngôn ngữ nhưng role/dialog + textbox + media input là tín hiệu ổn hơn.",
      observedHtml: [
        "<div role=\"dialog\" aria-label=\"Tạo bài viết\">",
        "  <div role=\"button\" aria-label=\"Đóng hộp thoại của công cụ tạo\"></div>",
        "  <div role=\"button\" aria-label=\"Chỉnh sửa quyền riêng tư. Đang chia sẻ với Công khai.\">Công khai</div>",
        "  <div role=\"textbox\" contenteditable=\"true\"></div>",
        "  <input type=\"file\" accept=\"image/*,image/heif,image/heic,video/*,...\" multiple />",
        "  <div role=\"button\" aria-label=\"Ảnh/video\"></div>",
        "  <div role=\"button\" aria-label=\"Tiếp\" aria-disabled=\"true|false\">Tiếp</div>",
        "</div>"
      ].join("\n"),
      stableSignals: [
        "[role='dialog'] scope",
        "[role='textbox'][contenteditable='true']",
        "input[type='file'][accept*='image/'][accept*='video/'][multiple]",
        "Next button becomes enabled after text/media is present"
      ],
      languageSensitiveSignals: [
        "aria-label='Tạo bài viết'",
        "aria-label='Ảnh/video'",
        "aria-label='Tiếp'",
        "text 'Bạn đang nghĩ gì?'"
      ],
      fallbackPlan: [
        "Find visible dialog containing one contenteditable textbox and one multi-file image/video input.",
        "Use the file input directly with Selenium sendKeys/set file path instead of clicking localized Photo/Video label.",
        "For next step, prefer visible enabled button near dialog footer; confirm it advances to settings dialog before publish."
      ]
    } satisfies FacebookDomFingerprint,
    pagePhotoVideoEntry: {
      description: "Nút Ảnh/video trên Page profile mở file chooser trực tiếp; fallback tốt nhất là bắt file chooser hoặc dùng file input image/video multiple hiện có.",
      observedHtml: [
        "<div role=\"button\" aria-label=\"Ảnh/video\">Ảnh/video</div>",
        "<input type=\"file\" accept=\"image/*,image/heif,image/heic,video/*,...\" multiple />"
      ].join("\n"),
      stableSignals: [
        "button is a Page-level action near composer entry",
        "file chooser isMultiple=true",
        "matching hidden input has accept image/video and multiple=true"
      ],
      languageSensitiveSignals: [
        "aria-label='Ảnh/video'",
        "text 'Ảnh/video'"
      ],
      fallbackPlan: [
        "If label changes, locate composer card by adjacent buttons: media, reel, live video.",
        "Use input[type=file][accept*='image/'][accept*='video/'][multiple] inside or near composer card.",
        "Validate upload by presence of media preview and remove/edit attachment controls."
      ]
    } satisfies FacebookDomFingerprint,
    postSettingsDialog: {
      description: "Màn cuối trước khi đăng bài thường/ảnh; không click Đăng nếu chưa ở đúng step.",
      observedHtml: [
        "<div role=\"dialog\" aria-label=\"Cài đặt bài viết\">",
        "  <div role=\"button\">Đối tượng của bài viết\\nCông khai</div>",
        "  <div role=\"button\">Lựa chọn lịch đăng\\nĐăng ngay</div>",
        "  <div role=\"button\">Chia sẻ lên nhóm...</div>",
        "  <div role=\"button\">Chia sẻ lên tin\\nTắt</div>",
        "  <input role=\"switch\" type=\"checkbox\" aria-label=\"Tắt\" />",
        "  <div role=\"button\" aria-label=\"Lưu bài viết làm bản nháp\">Lưu</div>",
        "  <div role=\"button\" aria-label=\"Đăng\">Đăng</div>",
        "</div>"
      ].join("\n"),
      stableSignals: [
        "dialog contains preview area and settings rows",
        "publish button is visible near footer and has role button",
        "boost is represented by input[role='switch'][type='checkbox']"
      ],
      languageSensitiveSignals: [
        "Cài đặt bài viết",
        "Đối tượng của bài viết",
        "Lựa chọn lịch đăng",
        "Đăng"
      ],
      fallbackPlan: [
        "Require that dialog has settings rows plus two footer buttons before considering publish.",
        "For scheduling, locate two input[role='combobox'][type='text'] fields inside schedule subdialog.",
        "Click publish only after expected options are configured and button is visible/enabled."
      ]
    } satisfies FacebookDomFingerprint,
    reelCreateDialog: {
      description: "Flow Reel có input video-only single file; đây là tín hiệu ít phụ thuộc ngôn ngữ hơn text Tạo thước phim.",
      observedHtml: [
        "<div role=\"dialog\">",
        "  Tạo thước phim",
        "  <input type=\"file\" accept=\"video/*,video/mp4,video/x-m4v,...\" />",
        "  <div role=\"button\">Thêm video\\nhoặc kéo và thả</div>",
        "  <div role=\"button\" aria-label=\"Tải video lên cho Thước phim\">Tải lên</div>",
        "</div>"
      ].join("\n"),
      stableSignals: [
        "[role='dialog'] contains video-only file input",
        "input[type='file'][accept^='video/']:not([multiple])",
        "upload/drag-drop area exists before preview",
        "after upload, video preview controls and enabled Next appear"
      ],
      languageSensitiveSignals: [
        "Tạo thước phim",
        "Tải video lên cho Thước phim",
        "Tiếp"
      ],
      fallbackPlan: [
        "Prefer video-only input over button text for upload.",
        "After upload, wait for Next enabled and video preview controls.",
        "Advance through edit step and final settings only when dialogs contain expected structural controls."
      ]
    } satisfies FacebookDomFingerprint,
    reelFinalSettingsDialog: {
      description: "Màn cuối Reel có nhiều setting row và nút Đăng; phải phân biệt với màn edit Reel.",
      observedHtml: [
        "<div role=\"dialog\">",
        "  Cài đặt thước phim",
        "  <div role=\"button\">Công khai...</div>",
        "  <div role=\"button\">Gắn thẻ và cộng tác...</div>",
        "  <div role=\"button\">Remix và sử dụng âm thanh gốc...</div>",
        "  <div role=\"button\">Chia sẻ lên nhóm...</div>",
        "  <div role=\"button\">Chia sẻ lên tin\\nTắt</div>",
        "  <input role=\"switch\" type=\"checkbox\" aria-label=\"Bật/tắt tính năng quảng bá thước phim\" />",
        "  <div role=\"button\">Lựa chọn lịch đăng\\nĐăng ngay</div>",
        "  <div role=\"button\" aria-label=\"Lưu\">Lưu</div>",
        "  <div role=\"button\" aria-label=\"Đăng\">Đăng</div>",
        "</div>"
      ].join("\n"),
      stableSignals: [
        "dialog contains multiple settings rows and video preview still visible",
        "boost reel switch has role=switch checkbox",
        "publish and save buttons are footer actions"
      ],
      languageSensitiveSignals: [
        "Cài đặt thước phim",
        "Gắn thẻ và cộng tác",
        "Đăng"
      ],
      fallbackPlan: [
        "Do not treat the caption/edit step as publish-ready.",
        "Require presence of schedule row or boost switch before locating publish button.",
        "If English UI, use structural rule: final step = settings rows + Save/Post footer + no upload input prompt."
      ]
    } satisfies FacebookDomFingerprint,
    commentBoxAsPage: {
      description: "Comment dưới tên Page; Page name trong aria có thể thay đổi theo Page nên không hardcode Ngọc Trai ở runtime.",
      observedHtml: [
        "<div role=\"button\" aria-label=\"Giọng nói hiện có, chuyển trang cá nhân\"></div>",
        "<div role=\"textbox\" contenteditable=\"true\" aria-label=\"Bình luận dưới tên Ngọc Trai\"></div>",
        "<div role=\"button\" aria-label=\"Đính kèm một ảnh hoặc video\"></div>",
        "<input type=\"file\" accept=\"video/*,...,image/*,image/heic,image/heif\" />"
      ].join("\n"),
      stableSignals: [
        "[role='textbox'][contenteditable='true'][aria-label*='Bình luận dưới tên']",
        "nearby attach media button",
        "single file input accepting both image/video",
        "voice switch button exists near comment composer"
      ],
      languageSensitiveSignals: [
        "Bình luận dưới tên {pageName}",
        "Giọng nói hiện có",
        "Đính kèm một ảnh hoặc video"
      ],
      fallbackPlan: [
        "Parameterize pageName; never hardcode observed Page name in runtime.",
        "If language changes, find comment textbox by contenteditable role near Like/Comment/Share controls.",
        "Validate voice identity by reading visible/aria text before submitting."
      ]
    } satisfies FacebookDomFingerprint
  },
  managedPageDiscovery: {
    pagesUrl: "https://www.facebook.com/pages/?category=your_pages",
    pageCard: {
      description: "Thẻ Page trong màn Trang bạn quản lý.",
      candidates: [
        { strategy: "xpath", value: "//*[contains(normalize-space(.), 'Trang bạn quản lý')]/ancestor-or-self::*//*[contains(normalize-space(.), '{pageName}')]", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[contains(normalize-space(.), '{pageName}') and (contains(normalize-space(.), 'Tạo bài viết') or contains(normalize-space(.), 'Quảng cáo'))]", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    createPostFromPageCard: {
      description: "Nút Tạo bài viết trong card Page quản lý.",
      candidates: [
        { strategy: "xpath", value: "//*[contains(normalize-space(.), '{pageName}')]/ancestor::*[.//*[contains(normalize-space(.), 'Tạo bài viết')]][1]//*[normalize-space(.)='Tạo bài viết']", confidence: "runtime-verified" },
        { strategy: "text", value: "Tạo bài viết", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    switchProfileDialog: {
      description: "Modal bắt buộc khi cần chuyển identity sang Page.",
      candidates: [
        { strategy: "text", value: "Chuyển trang cá nhân", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog' and contains(normalize-space(.), 'Chuyển sang {pageName}')]", confidence: "runtime-verified" }
      ]
    } satisfies FacebookSelectorGroup,
    switchButton: {
      description: "Nút xác nhận chuyển sang Page identity.",
      candidates: [
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Chuyển']", confidence: "runtime-verified" },
        { strategy: "text", value: "Chuyển", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup
  },
  pageComposer: {
    composerEntry: {
      description: "Mở composer đăng bài trên Page profile.",
      candidates: [
        { strategy: "xpath", value: "//*[@role='button' and normalize-space(.)='Bạn đang nghĩ gì?']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='button' and contains(normalize-space(.), 'đang nghĩ gì')]", confidence: "fallback" },
        { strategy: "xpath", value: "//*[@role='button' and contains(normalize-space(.), \"What's on your mind\")]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    dialog: {
      description: "Modal tạo bài viết.",
      candidates: [
        { strategy: "css", value: "[role='dialog'][aria-label='Tạo bài viết']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog' and contains(normalize-space(.), 'Tạo bài viết')]", confidence: "fallback" },
        { strategy: "css", value: "[role='dialog'][aria-label*='Create']", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    captionTextbox: {
      description: "Textbox nhập nội dung bài viết/Page caption.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='textbox'][contenteditable='true']", confidence: "runtime-verified" },
        { strategy: "css", value: "[role='dialog'] [data-lexical-editor='true']", confidence: "fallback" },
        { strategy: "css", value: "[contenteditable='true'][role='textbox']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    privacyButton: {
      description: "Nút quyền riêng tư trong composer.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label*='Chỉnh sửa quyền riêng tư']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and contains(normalize-space(.), 'Công khai')]", confidence: "fallback" },
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label*='privacy' i]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    mediaInput: {
      description: "Input upload ảnh/video trong composer Page; nhiều file.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] input[type='file'][accept*='image/'][accept*='video/'][multiple]", confidence: "runtime-verified" },
        { strategy: "css", value: "input[type='file'][accept*='image/'][accept*='video/']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    nextButton: {
      description: "Nút sang màn cài đặt bài viết.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label='Tiếp']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Tiếp']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Next']", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    publishButton: {
      description: "Nút đăng cuối. Chỉ dùng khi job thật sự được phép publish.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label='Đăng']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Đăng']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Post']", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    saveDraftButton: {
      description: "Nút lưu bản nháp, không dùng cho publish thường.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label='Lưu bài viết làm bản nháp']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Lưu']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup
  },
  addToPostOptions: {
    photoVideo: optionSelector("Ảnh/video", "runtime-verified"),
    tagPeople: optionSelector("Gắn thẻ người khác", "runtime-verified"),
    liveVideo: optionSelector("Video trực tiếp", "runtime-verified"),
    checkIn: optionSelector("Check in", "runtime-verified"),
    inviteCollaborator: optionSelector("Mời cộng tác viên", "runtime-verified"),
    feelingActivity: optionSelector("Cảm xúc/hoạt động", "runtime-verified"),
    gif: optionSelector("Ảnh GIF", "runtime-verified"),
    messages: optionSelector("Nhận tin nhắn", "runtime-verified"),
    whatsappMessages: optionSelector("Nhận tin nhắn WhatsApp", "runtime-verified"),
    calls: optionSelector("Nhận cuộc gọi", "runtime-verified")
  },
  photoPost: {
    editMediaButton: {
      description: "Mở màn chỉnh sửa file phương tiện sau khi upload ảnh.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label='Chỉnh sửa file phương tiện']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Chỉnh sửa']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    removeAttachmentButton: {
      description: "Gỡ ảnh/video khỏi composer.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label='Gỡ file đính kèm trong bài viết']", confidence: "runtime-verified" },
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label*='Remove' i]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    editPanelOptions: [
      "Cắt",
      "Xoay",
      "Gắn thẻ ảnh",
      "Công cụ chèn văn bản",
      "Văn bản thay thế"
    ]
  },
  postSettings: {
    settingsDialog: {
      description: "Màn cài đặt bài viết sau khi bấm Tiếp.",
      candidates: [
        { strategy: "xpath", value: "//*[@role='dialog' and contains(normalize-space(.), 'Cài đặt bài viết')]", confidence: "runtime-verified" },
        { strategy: "css", value: "[role='dialog'][aria-label='Cài đặt bài viết']", confidence: "runtime-verified" }
      ]
    } satisfies FacebookSelectorGroup,
    audience: settingsOptionSelector("Đối tượng của bài viết", "runtime-verified"),
    schedule: settingsOptionSelector("Lựa chọn lịch đăng", "runtime-verified"),
    shareToGroups: settingsOptionSelector("Chia sẻ lên nhóm", "runtime-verified"),
    shareToStory: settingsOptionSelector("Chia sẻ lên tin", "runtime-verified"),
    boostPost: settingsOptionSelector("Quảng bá bài viết", "runtime-verified"),
    scheduleDateInput: {
      description: "Ô ngày trong màn Lựa chọn lịch đăng.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] input[role='combobox'][type='text']", confidence: "runtime-verified", note: "Observed first combobox as date, e.g. 11 Tháng 6, 2026." },
        { strategy: "xpath", value: "//*[@role='dialog']//*[contains(normalize-space(.), 'Ngày')]/following::input[@role='combobox'][1]", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    scheduleTimeInput: {
      description: "Ô giờ trong màn Lựa chọn lịch đăng.",
      candidates: [
        { strategy: "xpath", value: "(//*[@role='dialog']//input[@role='combobox' and @type='text'])[2]", confidence: "runtime-verified", note: "Observed second combobox as time, e.g. 18:54." },
        { strategy: "xpath", value: "//*[@role='dialog']//*[contains(normalize-space(.), 'Thời gian')]/following::input[@role='combobox'][1]", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    scheduleLaterButton: optionSelector("Lên lịch đăng sau", "runtime-verified"),
    audienceDoneButton: {
      description: "Xác nhận chọn đối tượng.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label='Đã lựa chọn xong đối tượng quyền riêng tư và đóng hộp thoại']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and normalize-space(.)='Xong']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup
  },
  reel: {
    entryButton: {
      description: "Mở flow Tạo thước phim từ Page profile.",
      candidates: [
        { strategy: "css", value: "div[role='button'][aria-label='Thước phim']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='button' and normalize-space(.)='Thước phim']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='button' and contains(normalize-space(.), 'Reel')]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    createDialog: {
      description: "Modal Tạo thước phim.",
      candidates: [
        { strategy: "xpath", value: "//*[@role='dialog' and contains(normalize-space(.), 'Tạo thước phim')]", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog' and contains(normalize-space(.), 'Create reel')]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    videoInput: {
      description: "Input upload video cho Reel; single-file.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] input[type='file'][accept^='video/']:not([multiple])", confidence: "runtime-verified" },
        { strategy: "css", value: "input[type='file'][accept*='video/']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    uploadButton: {
      description: "Nút mở file chooser video trong modal Tạo thước phim.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='button'][aria-label='Tải video lên cho Thước phim']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and contains(normalize-space(.), 'Tải lên')]", confidence: "fallback" },
        { strategy: "xpath", value: "//*[@role='dialog']//*[@role='button' and contains(normalize-space(.), 'Upload')]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    editStepCaptionTextbox: {
      description: "Textbox mô tả Reel ở bước Chỉnh sửa thước phim.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] [role='textbox'][contenteditable='true']", confidence: "runtime-verified", note: "Placeholder text observed visually: Mô tả thước phim của bạn..." },
        { strategy: "css", value: "[role='dialog'] [data-lexical-editor='true']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup,
    trimVideo: optionSelector("Thu ngắn video", "runtime-verified"),
    captions: optionSelector("Phụ đề", "runtime-verified"),
    finalSettingsDialog: {
      description: "Màn Cài đặt thước phim.",
      candidates: [
        { strategy: "xpath", value: "//*[@role='dialog' and contains(normalize-space(.), 'Cài đặt thước phim')]", confidence: "runtime-verified" }
      ]
    } satisfies FacebookSelectorGroup,
    tagAndCollaborate: settingsOptionSelector("Gắn thẻ và cộng tác", "runtime-verified"),
    remixAndOriginalAudio: settingsOptionSelector("Remix và sử dụng âm thanh gốc", "runtime-verified"),
    boostReelSwitch: {
      description: "Switch quảng bá thước phim.",
      candidates: [
        { strategy: "css", value: "[role='dialog'] input[role='switch'][aria-label='Bật/tắt tính năng quảng bá thước phim']", confidence: "runtime-verified" },
        { strategy: "xpath", value: "//*[contains(normalize-space(.), 'Quảng bá thước phim')]//input[@role='switch']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup
  },
  comment: {
    voiceSwitcher: {
      description: "Nút đổi giọng bình luận giữa Page/profile.",
      candidates: [
        { strategy: "css", value: "[role='button'][aria-label='Giọng nói hiện có, chuyển trang cá nhân']", confidence: "runtime-verified" },
        { strategy: "css", value: "[role='button'][aria-label*='Giọng nói hiện có']", confidence: "fallback" },
        { strategy: "css", value: "[role='button'][aria-label*='current voice' i]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    textbox: {
      description: "Textbox bình luận dưới tên Page.",
      candidates: [
        { strategy: "css", value: "[role='textbox'][contenteditable='true'][aria-label='Bình luận dưới tên Ngọc Trai']", confidence: "runtime-verified" },
        { strategy: "css", value: "[role='textbox'][contenteditable='true'][aria-label*='Bình luận dưới tên']", confidence: "fallback" },
        { strategy: "css", value: "[role='textbox'][contenteditable='true'][aria-label*='Comment as' i]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    attachMediaButton: {
      description: "Nút đính kèm ảnh/video trong comment.",
      candidates: [
        { strategy: "css", value: "[role='button'][aria-label='Đính kèm một ảnh hoặc video']", confidence: "runtime-verified" },
        { strategy: "css", value: "[role='button'][aria-label*='Đính kèm']", confidence: "fallback" },
        { strategy: "css", value: "[role='button'][aria-label*='Attach' i]", confidence: "hypothesis" }
      ]
    } satisfies FacebookSelectorGroup,
    mediaInput: {
      description: "Input media cho comment; quan sát là single-file.",
      candidates: [
        { strategy: "css", value: "input[type='file'][accept*='image/'][accept*='video/']:not([multiple])", confidence: "runtime-verified" },
        { strategy: "css", value: "input[type='file'][accept*='image/'], input[type='file'][accept*='video/']", confidence: "fallback" }
      ]
    } satisfies FacebookSelectorGroup
  }
} as const;

function optionSelector(label: string, confidence: FacebookSelectorConfidence): FacebookSelectorGroup {
  return {
    description: `Option/button "${label}" observed in Facebook Page composer.`,
    candidates: [
      { strategy: "css", value: `[role='button'][aria-label='${label}']`, confidence },
      { strategy: "xpath", value: `//*[@role='button' and normalize-space(.)='${label}']`, confidence: "fallback" }
    ]
  };
}

function settingsOptionSelector(label: string, confidence: FacebookSelectorConfidence): FacebookSelectorGroup {
  return {
    description: `Settings row "${label}" observed in final post/Reel settings.`,
    candidates: [
      { strategy: "xpath", value: `//*[@role='dialog']//*[@role='button' and contains(normalize-space(.), '${label}')]`, confidence },
      { strategy: "text", value: label, confidence: "fallback" }
    ]
  };
}
