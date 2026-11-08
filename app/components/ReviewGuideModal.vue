<template>
    <UModal :open="open" @update:open="value => emit('update:open', value)" title="字幕核对操作指南" description="先筛选，再选择，最后重译或编辑；只有「最终导出」列会写入字幕文件。" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <div class="max-h-[72vh] space-y-3 overflow-y-auto pr-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">1. 先筛选，再决定处理范围</p>
            <p class="mt-1">搜索框可查原文、译文、最终导出和字幕编号。内容筛选中的「译文与原文相同」会忽略标点、空格、大小写和格式标签，适合找出 AI 没有真正翻译的条目。</p>
            <p class="mt-1">快捷筛选：<span class="font-medium">需要处理</span> 会合并空译文、同文、待核对、低质量、低置信度和有核对原因的条目；<span class="font-medium">未翻译 / 同文</span> 只筛空译文和同文。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">2. 勾选要处理的条目</p>
            <p class="mt-1">勾选单条后可按住 Shift 再点另一条，连续选中一段。「全选筛选结果」会选中当前筛选出的所有条目（跨页生效）；「反选」用于快速切换。</p>
          </section>
          <section class="rounded-2xl border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/40 dark:bg-primary-950/20">
            <p class="font-semibold text-primary-900 dark:text-primary-100">3. 重译会覆盖内容</p>
            <p class="mt-1 text-primary-800 dark:text-primary-200">「重译选中」和「重译筛选」都会调用当前翻译模型，覆盖这些条目的「当前译文」和「最终导出」，并清除旧质量评分。开始时系统会先保存未保存修改，但随后手动改动仍会被重译结果覆盖，也会产生模型调用费用。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">4. 三列文本分别是什么</p>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li><span class="font-medium">原文</span>：只读，字幕识别或源字幕内容。</li>
              <li><span class="font-medium">当前译文</span>：AI 翻译结果，供对照和恢复使用，不直接导出。</li>
              <li><span class="font-medium">最终导出</span>：可编辑，导出文件实际写入的内容。</li>
            </ul>
            <p class="mt-1">「使用原文」只把最终导出改成原文，适合人名、歌曲、无需翻译的台词；「恢复译文」把最终导出恢复成当前译文。</p>
          </section>
          <section class="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p class="font-semibold text-amber-900 dark:text-amber-100">5. 上移 / 下移 / 平移用于修正错位</p>
            <p class="mt-1 text-amber-800 dark:text-amber-200">整行上移下移会改变字幕顺序；「更多」里的全局平移和选区平移用于译文整体错位一行的情况。执行前建议先保存或确认当前筛选范围，避免影响未注意到的条目。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">6. 保存、导出、放弃的区别</p>
            <ul class="mt-1 list-disc space-y-1 pl-5">
              <li><span class="font-medium">保存修改</span>：只写入核对数据，不生成字幕文件。</li>
              <li><span class="font-medium">导出结果</span>：先保存，再生成字幕文件并标记任务完成，然后返回任务页。</li>
              <li><span class="font-medium">放弃成果</span>：把任务标记为失败并作废本次翻译结果，不可撤销。</li>
            </ul>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">7. AI 校对只给建议</p>
            <p class="mt-1">「AI 校对」不会自动修改字幕，只返回术语建议和一致性问题。结果会缓存，重进页面或误点不会重复消耗 Token；术语加入后只影响后续新任务。</p>
          </section>
          <section class="rounded-2xl border border-gray-200/70 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/30">
            <p class="font-semibold text-gray-900 dark:text-white">8. 键盘快捷键</p>
            <p class="mt-1"><span class="font-mono">J</span> / <span class="font-mono">K</span> 下一条 / 上一条；<span class="font-mono">Enter</span> 编辑当前条最终文本；<span class="font-mono">Ctrl/Cmd + S</span> 保存修改。</p>
          </section>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="开始操作" color="primary" @click="emit('update:open', false)" />
        </div>
      </template>
    </UModal>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
</script>
