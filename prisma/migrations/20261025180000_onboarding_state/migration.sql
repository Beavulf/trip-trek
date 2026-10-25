-- Обучение: подробный прогресс по турам, пауза, подсказки (src/lib/onboarding-state.ts)

-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardingState" JSONB;
