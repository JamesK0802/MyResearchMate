import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/james/Desktop/MyResearchMate/MyResearchMate/outputs/01a02d27-47b4-7e20-86f5-c80e197f5a3d";
const outputPath = path.join(outputDir, "CRISPR_tool_feature_comparison_rebuilt_2026-08-26.xlsx");
const previewDir = path.join(outputDir, "work_crispr_compare", "final_previews");

const NAVY = "#17365D";
const BLUE = "#4F81BD";
const PALE_BLUE = "#DCE6F1";
const GREEN = "#EAF4E2";
const GREEN_DARK = "#548235";
const PALE_YELLOW = "#FFF2CC";
const PALE_GRAY = "#F3F5F7";
const BORDER = "#D9E2F3";
const TEXT = "#243447";
const MUTED = "#667085";
const WHITE = "#FFFFFF";

const comparisonRows = [
  ["기본 정보", "대표 공개 시점", "현재 프로젝트 구현체; 공개 논문 없음", "2022, Nucleic Acids Research Web Server issue", "CRISPResso 2016; CRISPResso2 2019", "2024 논문(2023년 말 온라인 공개)", "연도는 성숙도·검증 기간의 참고값이지 성능 순위가 아님.", "S01,S03,S06"],
  ["기본 정보", "주된 목적", "ONT/Illumina 표적 amplicon 분석과 한 파일 내 다중 reference 경쟁 분류", "ONT 중심의 noisy-read clone/bulk 편집 분석", "amplicon·batch·pooled·WGS 편집 정량의 범용 생태계", "Illumina paired-end amplicon의 빠른 로컬 분석", "우리 도구의 핵심은 플랫폼 지원 하나가 아니라 pooled·유사 reference·curation의 결합.", "S00,S01,S03,S06"],
  ["배포·사용", "설치/접근 방식", "웹 앱; 분석은 브라우저 Web Worker, 계정 저장·공유는 서버 기능", "설치 없는 client-side 웹; 오프라인 사용 가능", "Bioconda·Docker·CLI; 제한된 공식 웹 제출 UI", "server-less 웹 + Windows/macOS/Linux desktop 배포", "모두 '로컬'일 수 있으나 브라우저 로컬, CLI 로컬, 서버 저장은 구분해야 함.", "S00,S01,S04,S06"],
  ["배포·사용", "비용·라이선스", "현재 저장소에서 공개 라이선스/가격 정책 미확인", "웹 사용은 무료; 소프트웨어 재배포 조건은 현행 배포물 확인 필요", "학술 사용 무료; 영리 조직은 별도 라이선스 필요", "웹/desktop 공개; 코드 라이선스 조건은 현행 저장소 확인 필요", "논문 공개와 소프트웨어 상업 이용 허가는 같은 의미가 아님.", "S02,S05,S07"],
  ["배포·사용", "데이터 이동", "FASTQ 분석은 브라우저 로컬; 사용자가 저장할 때 개인/lab storage 사용", "브라우저 client-side; 인터넷 연결 없이 사용 가능", "CLI는 사용자 환경; 공식 웹 사용 시 업로드", "모든 계산을 사용자 브라우저에서 수행한다고 논문에 명시", "민감 데이터 정책 비교 시 실행 위치와 영구 저장 여부를 따로 표기.", "S00,S01,S04,S06"],

  ["입력·플랫폼", "Oxford Nanopore", "전용 기본 workflow", "핵심 설계 대상; adaptive local alignment와 block consensus", "FASTQ 처리 사례는 있으나 전용 ONT mode/error model은 문서화되지 않음", "핵심 지원 모드로 기술되지 않음", "ONT/noisy-read 직접 비교 대상은 CRISPRnano가 가장 가까움.", "S00,S01,S04,S06"],
  ["입력·플랫폼", "Illumina", "구현됨: R1/R2 pair card, single mate, target-aware preprocessing", "Illumina FASTQ 지원; 논문 검증은 single-end 예시", "핵심 지원: single/paired FASTQ, Batch/Pooled", "핵심 지원: paired-end 또는 pre-merged FASTQ", "기존 파일의 '개발 예정' 표현을 현재 구현 상태로 갱신.", "S00,S01,S04,S06"],
  ["입력·플랫폼", "Illumina pair 처리", "R2 reverse-complement·quality reverse; 한쪽만 valid여도 X guard로 보존; 양쪽 valid면 target-relative consensus", "논문에서 paired-mate 전용 consensus 절차는 핵심 기능으로 설명되지 않음", "fastp merge 또는 CRISPResso aligner merge; 기본 fastp 최소 overlap 10 bp", "6 bp 초과 overlap에서 join; overlap이 없으면 해당 pair를 drop", "비중첩 pair 보존은 검증 가치가 큰 차별점이지만 accuracy benchmark가 필요.", "S00,S01,S04,S06"],
  ["입력·플랫폼", "여러 FASTQ 동시 처리", "여러 파일·paired sample을 한 세션에서 처리", "최대 96 FASTQ sample/run을 논문에 명시", "CRISPRessoBatch로 여러 sample 처리", "sample table로 여러 sample을 한 번에 입력", "파일 수 자체는 독창성이 아니며 sample·reference assignment semantics가 중요.", "S00,S01,S04,S06"],
  ["입력·플랫폼", "한 파일의 다중 reference", "여러 gene/reference 후보를 동시에 경쟁시키고 read를 best candidate에 배정", "한 FASTQ를 여러 reference에 경쟁 배정하는 기능은 논문의 핵심 workflow가 아님", "CRISPRessoPooled가 amplicon/genome 기준으로 demultiplex 후 region별 Core 실행", "barcode로 sample/haplotype을 구성한 뒤 target region에 mapping", "모두 pooled라는 단어를 쓸 수 있지만 처리 단위와 배정 방식은 다름.", "S00,S01,S04,S06"],
  ["입력·플랫폼", "유사 reference/homeolog", "Top1-Top2 margin과 ambiguous bucket으로 불확실 배정을 명시적으로 보존", "유사 reference 경쟁 분류를 주된 사용례로 기술하지 않음", "multiple amplicon/allele 정렬은 가능; ambiguous alignment 처리 옵션 존재", "유사 homeolog 경쟁 분류를 주된 사용례로 기술하지 않음", "polyploid·homeolog truth set에서 독립 검증하면 가장 방어 가능한 niche.", "S00,S04,S08"],

  ["분석 방식", "핵심 정렬/분류", "cut-site window/anchor 검출 → candidate score 비교 → gene/reference allocation", "target-centered adaptive Smith–Waterman local alignment + block consensus", "amplicon global alignment 후 quantification window에서 변이 정량", "paired join → barcode/haplotype 집계 → target region mapping", "window 기반과 full-amplicon 기반은 질문이 다르며 어느 한쪽이 항상 우월하지 않음.", "S00,S01,S04,S06"],
  ["분석 방식", "Window/target 중심 분석", "분류 단계부터 window와 anchor를 사용; 좌우 비대칭 window 지원", "DSB 주변 ROI 크기를 조절 가능", "guide/cut 기준 quantification window와 좌우 exclusion 제공", "target editing region을 중심으로 mutation 통계", "'CRISPResso2는 window가 없다'는 주장은 부정확.", "S00,S01,S04,S06"],
  ["분석 방식", "Ambiguous read", "margin 미달을 별도 ambiguous로 유지; 선택적 분석/rescue 경로", "multi-reference ambiguity가 주된 출력 구조는 아님", "multiple-reference alignment의 ambiguous reads를 제외 또는 확장 가능", "multi-reference ambiguous bucket이 주된 출력 구조는 아님", "우리 도구의 장점은 애매한 read를 억지 배정하지 않는 명시적 workflow.", "S00,S04"],
  ["분석 방식", "Quality 처리", "Phred threshold; Illumina consensus 불일치 시 더 높은 quality base 선택", "기본 Q7 filter; ONT noisy-read 최적화", "평균·단일 base quality filter, low-quality base의 N 치환, trimming", "원시 QC가 제한적이라고 논문에서 한계로 언급", "동일 데이터 비교 시 quality threshold와 trimming을 맞춰야 함.", "S00,S01,S04,S06"],
  ["분석 방식", "비관측 영역 표현", "비중첩 Illumina mates 사이를 window-size X로 분리; X는 scoring에서 제외", "동일한 paired X-guard 방식은 논문에 기술되지 않음", "통상 overlap merge; non-overlap은 같은 방식으로 pseudo-read화하지 않음", "overlap이 없으면 pair drop", "X는 생물학적 base가 아니라 guard이며, 별도 validation 항목으로 취급.", "S00,S04,S06"],
  ["분석 방식", "Large indel/구조변이", "window가 포착하는 범위의 indel 분석; 전용 long-read SV engine은 아님", "ROI 내 indel/knock-in 정량", "indel/HDR 등 amplicon 편집 정량에 강함; 전용 장거리 SV 도구와는 다름", "deletion·insertion·substitution과 편집 효율 계산", "large SV·integration까지 주장하려면 별도 long-read SV 도구와 비교 필요.", "S00,S01,S04,S06"],
  ["분석 방식", "Base/prime editing 특화", "현재 전용 mode 없음", "주요 headline 기능 아님", "base editor·prime editor 전용 파라미터와 출력 제공", "주요 headline 기능 아님", "CRISPResso2의 명확한 범용성 우위.", "S04"],

  ["결과·UI", "주요 결과", "reference/gene allocation, ambiguous, edit/indel 분류, read-level alignment 및 그룹", "read 수·alignment ratio·HDR/NHEJ·frameshift/in-frame·indel 목록", "unmodified/modified, insertions/deletions/substitutions, HDR/NHEJ, allele table과 plot", "mutation frequency, 편집 효율·정확도, indel/substitution 표와 plot", "같은 용어도 quantification window와 denominator가 다르면 수치를 직접 비교할 수 없음.", "S00,S01,S04,S06"],
  ["결과·UI", "Interactive review", "Sequence Viewer에서 alignment, 검색, aligned/unaligned 정렬, 그룹 검토", "pie chart와 개별 alignment track의 interactive 표시", "HTML report와 allele tables/plots; 별도 report 생태계가 성숙", "브라우저에서 표·plot을 생성하고 결과 다운로드", "우리 도구는 분석 후 read curation과 재수출 흐름이 강점.", "S00,S01,S04,S06"],
  ["결과·UI", "원본 read 재수출", "선택/분류된 read를 FASTQ로 다운로드 또는 Sequence Viewer로 export", "논문에서 선택 그룹 FASTQ 재수출을 headline 기능으로 설명하지 않음", "annotated FASTQ·BAM·VCF 등 선택적 출력 지원", "PDF, alignment text, Excel 결과 다운로드", "CRISPResso2도 FASTQ output이 있으므로 'FASTQ 출력 유일' 주장은 피해야 함.", "S00,S04,S06"],
  ["결과·UI", "저장·공유·lab workflow", "계정 personal/lab storage, quota, 공유, lab archive와 권한 관리", "분석기 자체는 client-side 결과 확인 중심", "파일 기반 결과·웹 제출; 연구실 storage 관리 제품은 아님", "로컬 결과 다운로드 중심", "분석 알고리즘보다 제품 workflow 차원의 차별점.", "S00,S01,S04,S06"],

  ["규모·검증", "공식 처리 규모 표현", "고정 최대 파일 수 없음; 브라우저 메모리·장치 성능의 영향", "최대 96 FASTQ samples/run", "Batch/Pooled/WGS로 다수 sample/locus; 실제 한계는 자원과 설정에 의존", "논문은 입력 파일 크기 제한이 없다고 설명하나 실제 브라우저 자원에 의존", "'무제한'은 실무 하드웨어 제약이 없다는 뜻이 아님.", "S00,S01,S04,S06"],
  ["규모·검증", "분석 속도", "동일 하드웨어 실측값 필요; 현재 타 도구와 직접 비교 수치 없음", "논문 장비·데이터 조건의 성능 제시; 다른 도구와 공정한 wall-time 비교는 아님", "병렬화·성숙한 CLI가 장점이나 데이터·hardware별 실측 필요", "브라우저 ReadableStream과 local processing을 속도 장점으로 제시", "높음/낮음 대신 동일 truth set에서 wall time·peak RAM·throughput을 기록해야 함.", "S01,S04,S06"],
  ["규모·검증", "가장 적합한 사용례", "ONT/Illumina pooled amplicon, 유사 reference/homeolog, interactive curation", "작은 clone/bulk ONT 결과를 설치 없이 빠르게 확인", "표준 Illumina amplicon과 Batch/Pooled/WGS, base/prime/HDR 분석", "Illumina paired-end target 분석을 브라우저에서 빠르게 수행", "도구 선택은 sequencing platform보다 biological question과 assignment model로 결정.", "S00,S01,S04,S06"],
  ["규모·검증", "핵심 한계", "독립 accuracy/runtime benchmark·공개 license·전용 SV/UMI/whole-genome 기능 필요", "paired consensus·한 파일 multi-reference 경쟁·협업 저장은 핵심 문서 기능 아님", "ONT 전용 오류 모델·브라우저 read curation·협업 storage는 주된 설계가 아님", "non-overlap pair drop, raw QC 제한, ONT 전용 분석 아님", "한계는 기능 부재가 아니라 공개 문서에서 확인되는 설계 범위 기준.", "S00,S01,S04,S06"],
];

const positioningRows = [
  ["가장 방어 가능한 핵심 포지션", "브라우저 로컬 CRISPR amplicon 분석에서 ONT와 Illumina를 같은 downstream 결과 모델로 처리하고, 한 pooled FASTQ의 reads를 여러 유사 gene/reference 후보에 경쟁 배정하며 ambiguous를 별도로 보존하는 workflow."],
  ["조합 차원의 차별성", "window/anchor 기반 후보 검출 + multi-reference score margin + ambiguous/rescue + target-aware Illumina pair preprocessing + Sequence Viewer curation/export + personal/lab 저장·공유가 한 제품에 결합됨."],
  ["Illumina 기술 포인트", "R1/R2가 겹치지 않아도 한 mate가 valid window/anchor를 가지면 window-size X guard로 다른 mate와 분리해 보존한다. 두 mates가 동일 target에 independently pass하면 quality-aware target-relative consensus를 만든다."],
  ["Pooled의 정확한 정의", "여기서 pooled는 '한 undemultiplexed FASTQ의 각 read가 여러 제공 reference/gene 후보와 경쟁하고 Top1-Top2 margin 미달은 ambiguous로 남는 것'이다."],
  ["CRISPRessoPooled와 차이", "CRISPRessoPooled는 amplicon 또는 genome alignment로 reads를 locus/region별 demultiplex한 뒤 각 region에 Core 분석을 수행한다. 유사하지만 assignment semantics와 출력 단위가 동일하지 않다."],
  ["CRISPRnano와 겹치는 부분", "ONT/noisy-read, client-side, target-centered window, interactive 결과는 이미 CRISPRnano가 강하게 확립했다. 따라서 'ONT 웹 분석'만을 독창성으로 주장하면 안 된다."],
  ["CrisprStitch와 겹치는 부분", "client-side Illumina paired-end 분석과 빠른 browser workflow는 CrisprStitch가 제공한다. 차이는 non-overlap 처리, multi-reference competition, post-analysis curation에 두어야 한다."],
  ["피해야 할 주장", "'ONT pooled 분석 도구는 전혀 없다', 'CRISPResso2는 여러 reference나 window를 처리하지 못한다', '다른 도구는 FASTQ를 출력할 수 없다', '우리 도구가 더 빠르다' 같은 절대 표현."],
  ["논문 전 검증 1", "유사 reference/homeolog truth set에서 read-to-reference accuracy, ambiguous calibration, Top1-Top2 margin별 precision/recall."],
  ["논문 전 검증 2", "같은 Illumina paired dataset에서 non-overlap 보존율, 잘못된 mate 결합률, consensus base accuracy, edit-frequency bias."],
  ["논문 전 검증 3", "같은 ONT/Illumina FASTQ·hardware에서 wall time, peak RAM, aligned fraction, indel frequency agreement."],
  ["논문 전 검증 4", "pooled vs 개별 amplicon 분석의 edit-frequency 보존, low-abundance reference 검출한계, large-indel 회수율."],
  ["한 줄 포지셔닝(국문)", "유사한 여러 표적 reference가 섞인 ONT·Illumina amplicon 데이터를 브라우저에서 경쟁 분류하고, 불확실 read를 보존하며, 결과 검토·재수출·공유까지 연결하는 CRISPR 분석 workflow."],
  ["One-line positioning (EN)", "A browser-local CRISPR amplicon workflow that competitively assigns pooled ONT and Illumina reads across multiple, potentially highly similar references while preserving ambiguous reads and supporting interactive curation and re-export."],
];

const sourceRows = [
  ["S00", "My Lab Mate", "구현 근거", "현재 저장소의 analysis pipeline, Illumina preprocessor, Sequence Viewer, storage/share 구현", "frontend/src/app/workers/core/analysis-pipeline.ts ; frontend/src/app/workers/core/illumina-preprocessor.ts ; frontend/src/app/components/sequence-workspace/fastq-viewer.component.ts", new Date("2026-08-26")],
  ["S01", "CRISPRnano", "논문", "ONT·Illumina 지원, client-side/offline, up to 96 FASTQ, Q7 filtering, target ROI, adaptive Smith–Waterman와 block consensus, 결과 항목", "https://academic.oup.com/nar/article/50/W1/W199/6595252", new Date("2026-08-26")],
  ["S02", "CRISPRnano", "웹/배포 확인", "웹 접근은 가능하나 재배포·상업 이용 조건은 현행 배포물에서 별도 확인 필요", "https://www.crisprnano.de", new Date("2026-08-26")],
  ["S03", "CRISPResso2", "논문", "CRISPResso2의 2019 공개, amplicon 정량·alignment·속도 개선·Batch/Pooled 생태계", "https://www.nature.com/articles/s41587-019-0032-3", new Date("2026-08-26")],
  ["S04", "CRISPResso2", "공식 문서", "v2.3.4 parameter: R1/R2, multiple amplicons, quality filters, fastp/CRISPResso merge, quantification window, optional FASTQ/BAM/VCF, base/prime parameters", "https://docs.crispresso.com/latest/parameters.html", new Date("2026-08-26")],
  ["S05", "CRISPResso2", "공식 저장소", "Bioconda/Docker, Batch/Pooled/WGS/Compare/Aggregate, academic free·for-profit license requirement", "https://github.com/pinellolab/CRISPResso2", new Date("2026-08-26")],
  ["S06", "CrisprStitch", "논문", "server-less local browser, desktop packages, paired/pre-merged FASTQ, >6 bp overlap join, non-overlap drop, barcode/haplotype, 결과 및 다운로드", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10943576/", new Date("2026-08-26")],
  ["S07", "CrisprStitch", "공식 저장소", "desktop 배포 및 현행 소프트웨어 조건 확인용", "https://github.com/zhangtaolab/CrisprStitch", new Date("2026-08-26")],
  ["S08", "CRISPResso2", "공식 웹 UI", "Batch TSV, paired-end batch 입력, multiple amplicons와 per-sample parameter 설정", "https://crispresso2.pinellolab.org/submission", new Date("2026-08-26")],
];

const workbook = Workbook.create();
const compare = workbook.worksheets.add("핵심 비교");
const position = workbook.worksheets.add("포지셔닝");
const sources = workbook.worksheets.add("근거 원장");

for (const sheet of [compare, position, sources]) sheet.showGridLines = false;

// --- 핵심 비교 ---
compare.mergeCells("A1:H1");
compare.getRange("A1").values = [["CRISPR Analysis Tool Feature Comparison"]];
compare.mergeCells("A2:H2");
compare.getRange("A2").values = [["대표 비교 대상 4종만 유지 · 제공 파일과 기존 상세 조사 내용을 통합 · evidence cutoff 2026-08-26"]];
compare.mergeCells("A3:H3");
compare.getRange("A3").values = [["읽는 법: '미문서화'는 기능 부재를 뜻하지 않으며, 속도·정확도는 동일 데이터와 하드웨어의 직접 benchmark 없이는 우열을 표시하지 않았습니다."]];
compare.getRange("A5:H5").values = [["범주", "비교 항목", "My Lab Mate", "CRISPRnano", "CRISPResso2", "CrisprStitch", "해석 / 주의", "근거 ID"]];
compare.getRange(`A6:H${5 + comparisonRows.length}`).values = comparisonRows;

compare.getRange("A1:H1").format = { fill: NAVY, font: { color: WHITE, bold: true, size: 18 }, verticalAlignment: "center" };
compare.getRange("A2:H2").format = { fill: NAVY, font: { color: "#D9EAF7", italic: true, size: 10 }, verticalAlignment: "center" };
compare.getRange("A3:H3").format = { fill: PALE_YELLOW, font: { color: TEXT, size: 9 }, verticalAlignment: "center", wrapText: true };
compare.getRange("A5:H5").format = { fill: NAVY, font: { color: WHITE, bold: true, size: 10 }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, borders: { preset: "all", style: "thin", color: WHITE } };
compare.getRange(`A6:H${5 + comparisonRows.length}`).format = { font: { color: TEXT, size: 9 }, verticalAlignment: "top", wrapText: true, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
compare.getRange(`C6:C${5 + comparisonRows.length}`).format.fill = GREEN;
compare.getRange(`G6:G${5 + comparisonRows.length}`).format.fill = PALE_YELLOW;
compare.getRange(`H6:H${5 + comparisonRows.length}`).format.font = { color: BLUE, size: 9 };
compare.getRange(`A6:A${5 + comparisonRows.length}`).format = { fill: PALE_BLUE, font: { color: NAVY, bold: true, size: 9 }, verticalAlignment: "top", wrapText: true, borders: { insideHorizontal: { style: "thin", color: BORDER } } };

const categoryStarts = [];
for (let i = 0; i < comparisonRows.length; i += 1) {
  if (i === 0 || comparisonRows[i][0] !== comparisonRows[i - 1][0]) categoryStarts.push(i + 6);
}
for (const row of categoryStarts) compare.getRange(`A${row}:H${row}`).format.borders = { top: { style: "medium", color: BLUE }, bottom: { style: "thin", color: BORDER } };

compare.getRange("A1:H1").format.rowHeight = 32;
compare.getRange("A2:H2").format.rowHeight = 22;
compare.getRange("A3:H3").format.rowHeight = 32;
compare.getRange("A5:H5").format.rowHeight = 34;
compare.getRange(`A6:H${5 + comparisonRows.length}`).format.rowHeight = 60;
compare.getRange(`A6:H${5 + comparisonRows.length}`).format.columnWidth = 18;
compare.getRange("A:A").format.columnWidth = 14;
compare.getRange("B:B").format.columnWidth = 24;
for (const col of ["C", "D", "E", "F"]) compare.getRange(`${col}:${col}`).format.columnWidth = 32;
compare.getRange("G:G").format.columnWidth = 38;
compare.getRange("H:H").format.columnWidth = 14;
compare.freezePanes.freezeRows(5);
compare.freezePanes.freezeColumns(2);
const compareTable = compare.tables.add(`A5:H${5 + comparisonRows.length}`, true, "FeatureComparisonTable");
compareTable.style = "TableStyleMedium2";

// Reapply semantic fills after table styling.
compare.getRange(`C6:C${5 + comparisonRows.length}`).format.fill = GREEN;
compare.getRange(`G6:G${5 + comparisonRows.length}`).format.fill = PALE_YELLOW;
compare.getRange(`A6:A${5 + comparisonRows.length}`).format.fill = PALE_BLUE;

// --- 포지셔닝 ---
position.mergeCells("A1:F1");
position.getRange("A1").values = [["My Lab Mate — Defensible Niche & Positioning"]];
position.mergeCells("A2:F2");
position.getRange("A2").values = [["독창성은 단일 기능이 아니라 조합과 assignment semantics에서 주장하고, 외부 benchmark가 없는 절대 우위 표현은 피합니다."]];
position.getRange("A4:B4").values = [["항목", "권장 표현 / 판단"]];
position.getRange(`A5:B${4 + positioningRows.length}`).values = positioningRows;
position.getRange("A1:F1").format = { fill: NAVY, font: { color: WHITE, bold: true, size: 18 }, verticalAlignment: "center" };
position.getRange("A2:F2").format = { fill: NAVY, font: { color: "#D9EAF7", italic: true, size: 10 }, verticalAlignment: "center", wrapText: true };
position.getRange("A4:B4").format = { fill: NAVY, font: { color: WHITE, bold: true, size: 10 }, verticalAlignment: "center" };
position.getRange(`A5:A${4 + positioningRows.length}`).format = { fill: NAVY, font: { color: WHITE, bold: true, size: 10 }, verticalAlignment: "top", wrapText: true, borders: { insideHorizontal: { style: "thin", color: "#8EA9C1" } } };
position.getRange(`B5:B${4 + positioningRows.length}`).format = { fill: GREEN, font: { color: TEXT, size: 10 }, verticalAlignment: "top", wrapText: true, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
for (const row of [12]) position.getRange(`A${row}:B${row}`).format.fill = PALE_YELLOW;
position.getRange("A1:F1").format.rowHeight = 32;
position.getRange("A2:F2").format.rowHeight = 28;
position.getRange("A4:B4").format.rowHeight = 30;
position.getRange(`A5:B${4 + positioningRows.length}`).format.rowHeight = 56;
position.getRange("A:A").format.columnWidth = 34;
position.getRange("B:B").format.columnWidth = 115;
position.freezePanes.freezeRows(4);
const positioningTable = position.tables.add(`A4:B${4 + positioningRows.length}`, true, "PositioningTable");
positioningTable.style = "TableStyleMedium2";
position.getRange(`A5:A${4 + positioningRows.length}`).format.fill = NAVY;
position.getRange(`A5:A${4 + positioningRows.length}`).format.font = { color: WHITE, bold: true, size: 10 };
position.getRange(`B5:B${4 + positioningRows.length}`).format.fill = GREEN;

// --- 근거 원장 ---
sources.mergeCells("A1:F1");
sources.getRange("A1").values = [["Evidence Register"]];
sources.mergeCells("A2:F2");
sources.getRange("A2").values = [["비교표의 근거 ID를 이 시트에서 추적합니다. URL은 plain text로 유지해 외부 검증이 가능하도록 했습니다."]];
sources.getRange("A4:F4").values = [["근거 ID", "도구", "자료 유형", "확인한 내용", "URL / 코드 경로", "확인일"]];
sources.getRange(`A5:F${4 + sourceRows.length}`).values = sourceRows;
sources.getRange("A1:F1").format = { fill: NAVY, font: { color: WHITE, bold: true, size: 18 }, verticalAlignment: "center" };
sources.getRange("A2:F2").format = { fill: NAVY, font: { color: "#D9EAF7", italic: true, size: 10 }, verticalAlignment: "center", wrapText: true };
sources.getRange("A4:F4").format = { fill: NAVY, font: { color: WHITE, bold: true, size: 10 }, verticalAlignment: "center", wrapText: true };
sources.getRange(`A5:F${4 + sourceRows.length}`).format = { font: { color: TEXT, size: 9 }, verticalAlignment: "top", wrapText: true, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
sources.getRange(`E5:E${4 + sourceRows.length}`).format.font = { color: BLUE, size: 9 };
sources.getRange(`F5:F${4 + sourceRows.length}`).format.numberFormat = "yyyy-mm-dd";
sources.getRange(`A5:A${4 + sourceRows.length}`).format.fill = PALE_BLUE;
sources.getRange("A1:F1").format.rowHeight = 32;
sources.getRange("A2:F2").format.rowHeight = 26;
sources.getRange("A4:F4").format.rowHeight = 32;
sources.getRange(`A5:F${4 + sourceRows.length}`).format.rowHeight = 58;
sources.getRange("A:A").format.columnWidth = 12;
sources.getRange("B:B").format.columnWidth = 20;
sources.getRange("C:C").format.columnWidth = 18;
sources.getRange("D:D").format.columnWidth = 60;
sources.getRange("E:E").format.columnWidth = 72;
sources.getRange("F:F").format.columnWidth = 14;
sources.freezePanes.freezeRows(4);
const sourceTable = sources.tables.add(`A4:F${4 + sourceRows.length}`, true, "EvidenceTable");
sourceTable.style = "TableStyleMedium2";

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const inspect = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 10000,
  tableMaxRows: 8,
  tableMaxCols: 8,
  tableMaxCellChars: 100,
});
await fs.writeFile(path.join(previewDir, "final-inspect.ndjson"), inspect.ndjson, "utf8");

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(previewDir, "formula-errors.ndjson"), errors.ndjson, "utf8");

for (const sheetName of ["핵심 비교", "포지셔닝", "근거 원장"]) {
  const image = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await image.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
