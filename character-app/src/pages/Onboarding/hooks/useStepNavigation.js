/**
 * 【React Hook】Stage 导航控制器 - 管理 Onboarding 流程的前进/后退
 *
 * 产品价值:
 * 1. 流程控制 - 统一管理 Stage 切换逻辑,防止跳过或重复
 * 2. 边界保护 - 自动限制在有效 Stage 范围内(1-4),防止越界
 * 3. 灵活导航 - 支持下一步/上一步/跳转到指定 Stage
 *
 * 技术实现:
 * - 状态机:currentStepNumber (1-4) 表示当前 Stage
 * - useCallback:优化性能,避免重复创建函数
 * - 边界检查:Math.min/Math.max 限制范围
 *
 * 使用场景:
 * - OnboardingEngine 使用此 hook 管理整个流程
 * - 每个 Stage 完成后调用 goToNextStep()
 */

import { useState, useCallback } from 'react'

export const useStepNavigation = (totalSteps = 7) => {
  const [currentStepNumber, setCurrentStepNumber] = useState(1)

  // 前进到下一个 Stage(最多到 totalSteps)
  const goToNextStep = useCallback(() => {
    setCurrentStepNumber(prev => Math.min(prev + 1, totalSteps))
  }, [totalSteps])

  // 后退到上一个 Stage(最少到 1)
  const goToPrevStep = useCallback(() => {
    setCurrentStepNumber(prev => Math.max(prev - 1, 1))
  }, [])

  // 跳转到指定 Stage(有边界检查)
  const goToStep = useCallback((stepNumber) => {
    if (stepNumber >= 1 && stepNumber <= totalSteps) {
      setCurrentStepNumber(stepNumber)
    }
  }, [totalSteps])

  // 是否为最后一个 Stage
  const isLastStep = currentStepNumber === totalSteps
  // 是否为第一个 Stage
  const isFirstStep = currentStepNumber === 1

  return {
    currentStepNumber,  // 当前 Stage 编号(1-4)
    goToNextStep,       // 前进一步
    goToPrevStep,       // 后退一步
    goToStep,           // 跳转到指定 Stage
    isLastStep,         // 是否为最后一步
    isFirstStep         // 是否为第一步
  }
}

export default useStepNavigation
