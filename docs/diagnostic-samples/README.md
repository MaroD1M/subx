# Diagnostic Samples

用于沉淀高风险或历史出错的字幕样本，方便回归验证与规则迭代。

## 目录约定
- `lyrics/`：歌词型字幕
- `non_dialogue/`：环境音、括号旁白、纯提示音
- `bilingual_source/`：源字幕本身包含双语
- `formatting_tokens/`：包含 `__SUBX_FMT_n__`、ASS 标签、复杂样式
- `multi_line_dialogue/`：多行短句、多人对话、易串条场景
- `long_text/`：长句、密集说明、易截断场景

## 每个样本建议内容
- 原始字幕片段
- 期望行为
- 历史问题表现
- 是否应缩块
- 是否应进入 review

## 后续用法
- 新发现的异常字幕优先沉淀进这里
- 回归测试可逐步从这些样本中抽取
- 诊断面板里的高风险标签应能与这里的分类对应
