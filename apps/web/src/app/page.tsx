import { AffiliateSection } from '@/components/AffiliateSection';
import { AppScreensSection } from '@/components/AppScreensSection';
import { FaqSection } from '@/components/FaqSection';
import { FinalCtaSection } from '@/components/FinalCtaSection';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { HowItWorksSection } from '@/components/HowItWorksSection';
import { PlanSection } from '@/components/PlanSection';
import { PromoVideoSection } from '@/components/PromoVideoSection';
import { SolutionSection } from '@/components/SolutionSection';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <PromoVideoSection />
        <SolutionSection />
        <HowItWorksSection />
        <AppScreensSection />
        <PlanSection />
        <AffiliateSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </>
  );
}
