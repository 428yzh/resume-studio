import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

const COLORS = {
  ink: "#0a0a0a",
  charcoal: "#222222",
  slate: "#475569",
  muted: "#94a3b8",
  hairline: "#e2e8f0",
};

const styles = StyleSheet.create({
  page: {
    padding: "40px 48px",
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.charcoal,
    lineHeight: 1.5,
  },
  header: { marginBottom: 16 },
  name: { fontSize: 24, fontWeight: 700, color: COLORS.ink, marginBottom: 2 },
  title: { fontSize: 11, color: COLORS.slate, marginBottom: 2 },
  contactLine: { fontSize: 9, color: COLORS.slate, flexDirection: "row", gap: 8 },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    borderBottomWidth: 2,
    paddingBottom: 4,
    marginBottom: 8,
  },
  body: { fontSize: 10, color: COLORS.charcoal, lineHeight: 1.6 },
  itemBlock: { marginBottom: 8 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  itemTitle: { fontSize: 10, fontWeight: 700, color: COLORS.ink },
  itemSubtitle: { fontSize: 9, color: COLORS.slate },
  itemDate: { fontSize: 9, color: COLORS.slate },
  itemDescription: { fontSize: 9, color: COLORS.charcoal, lineHeight: 1.5, marginTop: 2 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag: {
    fontSize: 8,
    color: COLORS.slate,
    padding: "2px 6px",
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 4,
  },
  empty: { color: COLORS.muted, fontSize: 10, textAlign: "center" as const, marginTop: 40 },
});

interface SectionItem {
  key: string;
  title: string;
  data: unknown;
}

interface ResumePDFProps {
  resume: {
    id: number;
    title: string;
    template_id: number;
    sections: Record<string, unknown>;
    target_company: string;
    target_position: string;
    created_at: string;
    updated_at: string;
  };
  template: { structure: { style?: Record<string, string> } };
  sections: SectionItem[];
}

/** Safely extract string from unknown value */
function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

export default function ResumePDF({ resume, template, sections }: ResumePDFProps) {
  const primaryColor = template.structure.style?.primary_color || "#1456f0";

  function renderHeader(data: unknown) {
    const h = data as Record<string, unknown> | undefined;
    if (!h) return null;
    return (
      <View style={styles.header}>
        <Text style={[styles.name, { color: COLORS.ink }]}>{str(h.name) || resume.title}</Text>
        {str(h.title) ? <Text style={styles.title}>{str(h.title)}</Text> : null}
        <View style={styles.contactLine}>
          {str(h.email) ? <Text>{str(h.email)}</Text> : null}
          {str(h.phone) ? <Text>{str(h.phone)}</Text> : null}
          {str(h.location) ? <Text>{str(h.location)}</Text> : null}
        </View>
      </View>
    );
  }

  function renderSummary(data: unknown) {
    const s = data as Record<string, unknown> | undefined;
    const content = str(s?.content);
    if (!content) return null;
    return <Text style={styles.body}>{content}</Text>;
  }

  function renderItems(data: unknown, renderItem: (item: Record<string, unknown>, idx: number) => React.ReactNode) {
    if (!Array.isArray(data)) return null;
    return data.map((item, i) => {
      const key = str(item.id, String(i));
      return <View key={key} style={styles.itemBlock} wrap={false}>{renderItem(item as Record<string, unknown>, i)}</View>;
    });
  }

  function renderExperience(data: unknown) {
    return renderItems(data, (item) => (
      <>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{str(item.company)}</Text>
          <Text style={styles.itemDate}>
            {str(item.start_date)}{str(item.start_date) ? " - " : ""}{item.current ? "至今" : str(item.end_date)}
          </Text>
        </View>
        {str(item.position) ? <Text style={styles.itemSubtitle}>{str(item.position)}</Text> : null}
        {str(item.description) ? <Text style={styles.itemDescription}>{str(item.description)}</Text> : null}
      </>
    ));
  }

  function renderEducation(data: unknown) {
    return renderItems(data, (item) => (
      <>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{str(item.school)}</Text>
          <Text style={styles.itemDate}>{str(item.start_date)} - {str(item.end_date)}</Text>
        </View>
        <Text style={styles.itemSubtitle}>{[str(item.degree), str(item.major)].filter(Boolean).join(" · ")}</Text>
      </>
    ));
  }

  function renderSkills(data: unknown) {
    if (!Array.isArray(data)) return null;
    return (
      <View style={styles.tagRow}>
        {data.map((item, i) => {
          const it = item as Record<string, unknown>;
          return <Text key={str(it.id, String(i))} style={styles.tag}>{str(it.name)}{it.level ? ` · ${str(it.level)}` : ""}</Text>;
        })}
      </View>
    );
  }

  function renderProjects(data: unknown) {
    return renderItems(data, (item) => (
      <>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{str(item.name)}</Text>
          {str(item.role) ? <Text style={styles.itemSubtitle}>{str(item.role)}</Text> : null}
        </View>
        {str(item.tech_stack) ? <Text style={styles.itemSubtitle}>技术栈：{str(item.tech_stack)}</Text> : null}
        {str(item.description) ? <Text style={styles.itemDescription}>{str(item.description)}</Text> : null}
      </>
    ));
  }

  function renderCertifications(data: unknown) {
    return renderItems(data, (item) => (
      <>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{str(item.name)}</Text>
          {str(item.date) ? <Text style={styles.itemDate}>{str(item.date)}</Text> : null}
        </View>
        {str(item.issuer) ? <Text style={styles.itemSubtitle}>{str(item.issuer)}</Text> : null}
      </>
    ));
  }

  function renderLanguages(data: unknown) {
    if (!Array.isArray(data)) return null;
    return (
      <View style={styles.tagRow}>
        {data.map((item, i) => {
          const it = item as Record<string, unknown>;
          return <Text key={str(it.id, String(i))} style={styles.tag}>{str(it.name)}{it.level ? ` · ${str(it.level)}` : ""}</Text>;
        })}
      </View>
    );
  }

  function renderSectionContent(key: string, data: unknown) {
    switch (key) {
      case "header": return renderHeader(data);
      case "summary": return renderSummary(data);
      case "experience": return renderExperience(data);
      case "education": return renderEducation(data);
      case "skills": return renderSkills(data);
      case "projects": return renderProjects(data);
      case "certifications": return renderCertifications(data);
      case "languages": return renderLanguages(data);
      default: return null;
    }
  }

  const isEmpty = sections.every((s) => !s.data || (Array.isArray(s.data) && s.data.length === 0) || (typeof s.data === "object" && !Object.values(s.data as Record<string, unknown>).some((v) => typeof v === "string" && (v as string).trim())));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {renderHeader(sections.find((s) => s.key === "header")?.data)}

        {sections
          .filter((s) => s.key !== "header")
          .map((sec) => {
            const content = renderSectionContent(sec.key, sec.data);
            if (!content) return null;
            return (
              <View key={sec.key} style={styles.section} wrap={false}>
                <Text style={[styles.sectionTitle, { color: primaryColor, borderBottomColor: primaryColor }]}>
                  {sec.title}
                </Text>
                {content}
              </View>
            );
          })}

        {isEmpty && <Text style={styles.empty}>暂无内容</Text>}
      </Page>
    </Document>
  );
}
