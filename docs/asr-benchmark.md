# SubX ASR 11 语言基准

> 适用版本：v2.6.2
> 目的：用统一脚本记录各硬件、引擎、模型的 RTF、平均置信度和可用性。

## 样本要求

每个语言准备 5–10 分钟清晰对白，文件名使用语言代码：

```text
samples/
  en.wav
  ja.wav
  ko.wav
  zh.wav
  ru.wav
  fr.wav
  th.wav
  es.wav
  de.wav
  it.wav
  pt.wav
```

支持 `.wav`、`.mp3`、`.m4a`、`.flac`、`.ogg`、`.mp4`、`.mkv`。

## 运行

```bash
node scripts/asr-benchmark.mjs \
  --samples ./samples \
  --base-url http://127.0.0.1:8000 \
  --engine auto \
  --model small \
  --out docs/asr-benchmark-result.md
```

对每个设备/模型组合分别运行，例如：

```bash
node scripts/asr-benchmark.mjs --samples ./samples --engine faster-whisper --model small
node scripts/asr-benchmark.mjs --samples ./samples --engine whisper-cpp --model small
node scripts/asr-benchmark.mjs --samples ./samples --engine faster-whisper --model medium
```

## 参考结果模板

| 设备 | 引擎 | 模型 | 精度 | RTF | 1 小时参考 | 平均置信度 | 备注 |
| --- | --- | --- | --- | ---: | ---: | ---: | --- |
| J1900 / J4125 | whisper.cpp | small | ggml | 待实测 | 待实测 | 待实测 | 低配建议 |
| N5105 / N100 | faster-whisper | small | int8 | 待实测 | 待实测 | 待实测 | 主流 |
| i3-8100 | faster-whisper | medium | int8 | 待实测 | 待实测 | 待实测 | 主流 |
| i5-8400 / Ryzen 5 | faster-whisper | medium | int8 | 待实测 | 待实测 | 待实测 | 进阶 |
| RTX 3060 12GB | faster-whisper | large-v3-turbo | float16 | 待实测 | 待实测 | 待实测 | GPU |
| 云 ASR | cloud | whisper-1 | API | 待实测 | 待实测 | 待实测 | 可选兜底 |

> 本仓库不附带受版权保护的测试音频。请使用自有或公开授权样本后生成实测报告。

## 指标说明

- **RTF** = 处理耗时 / 音频时长，越小越好。
- **平均置信度** = 有置信度分段的平均值；whisper.cpp 可能不返回置信度。
- **1 小时参考** = 按 RTF 线性估算，仅用于容量规划。
