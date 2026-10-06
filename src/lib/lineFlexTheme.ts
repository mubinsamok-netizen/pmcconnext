type FlexComponent = {
  [key: string]: unknown;
  contents?: FlexComponent[];
};

type FlexMessage = Record<string, unknown> & {
  contents?: FlexComponent;
};

const METRIC_LABELS = new Set(["มูลค่า", "จำนวน Defect"]);
const KEY_DETAIL_LABELS = new Set(["รายการ", "ต้องตัดสินใจก่อน", "กำหนดอนุมัติ", "วันเพิ่ม"]);
const DEADLINE_LABELS = new Set(["ต้องตัดสินใจก่อน", "กำหนดอนุมัติ"]);

export const LINE_FLEX_HERO_IMAGES = {
  dailyReport: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1200&q=85",
  customerDecision: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=85",
  defect: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=85",
  qc: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=1200&q=85",
  memo: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=1200&q=85",
  variationOrder: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=85",
} as const;

export function buildLineFlexHero(imageUrl: string, badgeText: string): FlexComponent {
  return {
    type: "box",
    layout: "vertical",
    paddingAll: "0px",
    contents: [
      {
        type: "image",
        url: imageUrl,
        size: "full",
        aspectRatio: "20:11",
        aspectMode: "cover",
      },
      {
        type: "box",
        layout: "horizontal",
        position: "absolute",
        offsetTop: "12px",
        offsetStart: "12px",
        backgroundColor: "#ff5b6e",
        cornerRadius: "16px",
        paddingAll: "7px",
        width: badgeWidth(badgeText),
        contents: [{
          type: "text",
          text: badgeText,
          color: "#ffffff",
          size: "xxs",
          weight: "bold",
          align: "center",
        }],
      },
    ],
  };
}

export function applyLineFlexTheme<T extends FlexMessage>(
  message: T,
  options: {
    heroImageUrl: string;
    badgeText: string;
    metadataTypography?: "default" | "comfortable";
  },
): T {
  const bubble = asComponent(message.contents);
  if (!bubble) return message;

  const header = asComponent(bubble.header);
  const body = asComponent(bubble.body);
  if (!header || !body) return message;

  const headerContents = header.contents || [];
  const originalBodyContents = body.contents || [];
  const firstBody = originalBodyContents[0];
  const projectText = firstBody?.type === "text" ? firstBody : undefined;
  const detailContents = projectText ? originalBodyContents.slice(1) : originalBodyContents;

  const title = styleText(headerContents[1], {
    color: "#ffffff",
    size: "xl",
    weight: "bold",
    margin: undefined,
  });
  const project = projectText ? styleText(projectText, {
    color: "#d8e4ef",
    size: "sm",
    weight: "regular",
  }) : undefined;
  const documentNo = styleText(headerContents[2], {
    color: "#8edfd1",
    size: "xs",
    weight: "bold",
    margin: undefined,
  });

  bubble.hero = buildLineFlexHero(options.heroImageUrl, options.badgeText);
  bubble.size = "giga";
  delete bubble.header;

  body.backgroundColor = "#243b55";
  body.paddingAll = "20px";
  body.spacing = "sm";
  body.contents = [
    title,
    project,
    documentNo,
    ...detailContents.map((component) => styleBodyComponent(component, options.metadataTypography)),
  ].filter(isComponent);

  const footer = asComponent(bubble.footer);
  if (footer) {
    footer.backgroundColor = "#243b55";
    footer.paddingAll = "12px";
    footer.paddingTop = "4px";
    footer.spacing = "xs";
    footer.contents = (footer.contents || []).map(styleFooterComponent);
  }

  delete bubble.styles;
  return message;
}

function styleBodyComponent(
  component: FlexComponent,
  metadataTypography: "default" | "comfortable" = "default",
): FlexComponent {
  if (component.type === "separator") {
    return { ...component, color: "#48617a" };
  }

  if (component.type === "text") {
    const isSectionLabel = componentText(component) === "เรื่อง";
    const isProminentText = component.weight === "bold"
      && ["md", "lg", "xl", "xxl", "3xl", "4xl", "5xl"].includes(String(component.size || ""));
    return styleText(component, {
      color: isSectionLabel ? "#8edfd1" : isProminentText ? "#ffffff" : "#afc1d3",
      size: component.size || "xs",
    });
  }

  if (isMetadataRow(component)) return styleMetadataRow(component, metadataTypography);

  if (component.layout === "vertical") {
    const children = component.contents || [];
    if (children.length > 0 && children.every(isMetadataRow)) {
      return {
        ...component,
        spacing: "none",
        contents: children.map((child) => styleMetadataRow(child, metadataTypography)),
      };
    }

    if (component.backgroundColor) {
      return {
        ...component,
        cornerRadius: "12px",
        paddingAll: component.paddingAll || "14px",
        contents: children.map((child, index) => child.type === "text" && index > 0
          ? styleText(child, { size: minimumImportantTextSize(child.size) })
          : child),
      };
    }

    return {
      ...component,
      backgroundColor: "#f3f8fc",
      cornerRadius: "12px",
      paddingAll: "14px",
      contents: children.map((child, index) => child.type === "text"
        ? styleText(child, {
          color: index === 0 ? "#078b78" : "#172b3f",
          size: index === 0 ? "xs" : contentTextSize(child.size),
          weight: child.weight || "bold",
        })
        : child),
    };
  }

  return component;
}

function styleMetadataRow(
  component: FlexComponent,
  metadataTypography: "default" | "comfortable" = "default",
): FlexComponent {
  const children = component.contents || [];
  const label = componentText(children[0]);
  const isMetric = METRIC_LABELS.has(label);
  const isKeyDetail = KEY_DETAIL_LABELS.has(label);
  const isDeadline = DEADLINE_LABELS.has(label);
  const isComfortable = metadataTypography === "comfortable";

  return {
    ...component,
    margin: isMetric || isKeyDetail ? "sm" : "xs",
    contents: children.map((child, index) => child.type === "text"
      ? styleText(child, {
        color: index === 0
          ? "#afc1d3"
          : isMetric
            ? "#8edfd1"
            : isDeadline
              ? "#ffe0a3"
              : "#ffffff",
        size: isComfortable
          ? index === 0 ? "sm" : isMetric ? "lg" : "md"
          : index === 0
            ? isMetric || isKeyDetail ? "xs" : "xxs"
            : isMetric ? "md" : isKeyDetail ? "sm" : "xs",
        weight: index > 0 && (isComfortable || isMetric || isKeyDetail) ? "bold" : "regular",
        align: index > 0 ? "end" : child.align,
      })
      : child),
  };
}

function styleFooterComponent(component: FlexComponent, index: number): FlexComponent {
  if (component.type !== "button") return component;
  return {
    ...component,
    style: index === 0 ? "primary" : "secondary",
    color: index === 0 ? "#2bbfa5" : "#ffffff",
    height: "sm",
  };
}

function styleText(component: FlexComponent | undefined, styles: FlexComponent): FlexComponent {
  if (!component) return {};
  const result = { ...component, ...styles };
  for (const [key, value] of Object.entries(result)) {
    if (value === undefined) delete result[key];
  }
  return result;
}

function isMetadataRow(component: FlexComponent) {
  return (component.layout === "horizontal" || component.layout === "baseline")
    && (component.contents || []).filter((child) => child.type === "text").length >= 2;
}

function asComponent(value: unknown): FlexComponent | undefined {
  return value && typeof value === "object" ? value as FlexComponent : undefined;
}

function isComponent(value: FlexComponent | undefined): value is FlexComponent {
  return Boolean(value && Object.keys(value).length > 0);
}

function componentText(component: FlexComponent | undefined) {
  return typeof component?.text === "string" ? component.text.trim() : "";
}

function contentTextSize(size: unknown) {
  return size === "xxs" || size === "xs" || !size ? "sm" : size;
}

function minimumImportantTextSize(size: unknown) {
  return size === "xxs" || size === "xs" || !size ? "sm" : size;
}

function badgeWidth(text: string) {
  return `${Math.max(84, Math.min(148, 28 + text.length * 7))}px`;
}
