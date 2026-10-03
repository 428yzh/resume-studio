import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { Question, QuizAnswer } from "@core/models/quiz";

const COLORS = {
  ink: "#0a0a0a",
  charcoal: "#222222",
  slate: "#475569",
  muted: "#94a3b8",
  hairline: "#e2e8f0",
  blue: "#1456f0",
  green: "#059669",
  red: "#dc2626",
};

const styles = StyleSheet.create({
  page: {
    padding: "40px 48px 56px",
    // 见 pdfService.ts 的 Font.register：必须用注册过的 CJK 字体，Helvetica 出不了中文
    fontFamily: "NotoSansSC",
    fontSize: 10,
    color: COLORS.charcoal,
    lineHeight: 1.5,
  },
  h1: { fontSize: 18, fontWeight: 700, color: COLORS.ink, marginBottom: 3 },
  subtitle: { fontSize: 9, color: COLORS.slate, marginBottom: 10 },
  rule: { borderBottomWidth: 1, borderBottomColor: COLORS.hairline, marginBottom: 14 },
  block: { marginBottom: 14 },
  stem: { marginBottom: 6 },
  stemRow: { flexDirection: "row", alignItems: "flex-start" },
  index: { fontSize: 10, fontWeight: 700, color: COLORS.blue, width: 20 },
  stemText: { fontSize: 10, color: COLORS.ink, flex: 1, fontWeight: 700 },
  tag: {
    fontSize: 7,
    color: COLORS.slate,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 3,
    padding: "1px 4px",
    marginLeft: 6,
  },
  options: { marginLeft: 20, marginTop: 3 },
  option: { fontSize: 9.5, color: COLORS.charcoal, marginBottom: 3 },
  blankLine: { fontSize: 9.5, color: COLORS.muted, marginLeft: 20, marginTop: 4 },
  answerBox: {
    marginLeft: 20,
    marginTop: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#f7f8fa",
    borderLeftWidth: 2,
    borderLeftColor: COLORS.blue,
  },
  answerRow: { flexDirection: "row", marginBottom: 2 },
  answerLabel: { fontSize: 9, color: COLORS.slate, width: 62 },
  answerValue: { fontSize: 9, color: COLORS.charcoal, flex: 1 },
  verdict: { fontSize: 9, fontWeight: 700 },
  empty: { color: COLORS.muted, fontSize: 10, textAlign: "center", marginTop: 40 },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 48,
    right: 48,
    fontSize: 8,
    color: COLORS.muted,
    textAlign: "center",
  },
});

const TYPE_LABEL: Record<string, string> = {
  single_choice: "单选",
  multi_choice: "多选",
  essay: "问答",
};

interface QuizPDFProps {
  title: string;
  subtitle?: string;
  questions: Question[];
  /** 用户作答记录。有则渲染「你的答案 / 判定 / AI 评分 / AI 评语」 */
  answers?: QuizAnswer[];
  /** 只出正确答案、不出用户作答（技能复习 / JD 复习用） */
  showAnswers?: boolean;
}

export default function QuizPDF({ title, subtitle, questions, answers, showAnswers }: QuizPDFProps) {
  const answerMap = new Map((answers || []).map((a) => [a.question_id, a]));
  const withAnswers = showAnswers || (answers != null && answers.length > 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.rule} />

        {questions.length === 0 && <Text style={styles.empty}>暂无题目</Text>}

        {questions.map((q, i) => {
          const a = answerMap.get(q.id);
          // 选择题整块不跨页（否则「正确答案」会被甩到下一页、和题干预部脱节）；
          // 问答题的用户作答 + 参考答案可能超一页，必须允许跨页。
          return (
            <View key={q.id} style={styles.block} wrap={q.type === "essay"}>
              {/* 题干 + 选项整组不跨页，避免题目和选项被拆开 */}
              <View wrap={false}>
                <View style={styles.stemRow}>
                  <Text style={styles.index}>{i + 1}.</Text>
                  <Text style={styles.stemText}>{q.question_text}</Text>
                  <Text style={styles.tag}>{TYPE_LABEL[q.type] || q.type}</Text>
                </View>
                {q.options.length > 0 && (
                  <View style={styles.options}>
                    {q.options.map((o) => (
                      <Text key={o.key} style={styles.option}>
                        {o.key}. {o.text}
                      </Text>
                    ))}
                  </View>
                )}
                {!withAnswers && q.type === "essay" && (
                  <Text style={styles.blankLine}>答：______________________________________</Text>
                )}
              </View>

              {/* 答案区允许跨页：问答的用户作答 + 参考答案可能很长 */}
              {withAnswers && (
                <View style={styles.answerBox}>
                  {a && (
                    <View style={styles.answerRow}>
                      <Text style={styles.answerLabel}>你的答案</Text>
                      <Text style={styles.answerValue}>{a.user_answer || "（未作答）"}</Text>
                    </View>
                  )}
                  {q.type === "essay" && a?.ai_score != null && (
                    <View style={styles.answerRow}>
                      <Text style={styles.answerLabel}>AI 评分</Text>
                      <Text style={styles.answerValue}>
                        {a.ai_score} / 100
                      </Text>
                    </View>
                  )}
                  {a?.is_correct != null && (
                    <View style={styles.answerRow}>
                      <Text style={styles.answerLabel}>判定</Text>
                      <Text
                        style={[
                          styles.answerValue,
                          styles.verdict,
                          { color: a.is_correct ? COLORS.green : COLORS.red },
                        ]}
                      >
                        {/* 不要用 ✓/✗/√：Noto Sans SC 的 chinese-simplified 子集里没有这些码位（gid=0），
                            会渲染成空白。色彩之外只有「正确/错误」二字做区分，黑白打印也能读。 */}
                        {a.is_correct ? "正确" : "错误"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.answerRow}>
                    <Text style={styles.answerLabel}>正确答案</Text>
                    <Text style={[styles.answerValue, { fontWeight: 700 }]}>
                      {a?.ai_reference || q.correct_answer || "—"}
                    </Text>
                  </View>
                  {a?.ai_feedback ? (
                    <View style={styles.answerRow}>
                      <Text style={styles.answerLabel}>AI 评语</Text>
                      <Text style={styles.answerValue}>{a.ai_feedback}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}
