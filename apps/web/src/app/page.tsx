import { AffiliateSection } from '@/components/AffiliateSection';
import { AppScreensSection } from '@/components/AppScreensSection';
import { FaqSection } from '@/components/FaqSection';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { Hero } from '@/components/Hero';
import { HowItWorksSection } from '@/components/HowItWorksSection';
import { PrivacySection } from '@/components/PrivacySection';
import { ProblemSection } from '@/components/ProblemSection';
import { SignupSection } from '@/components/SignupSection';
import { SolutionSection } from '@/components/SolutionSection';

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <AppScreensSection />
        <AffiliateSection />
        <PrivacySection />
        <SignupSection />
        <FaqSection />
      </main>
      <Footer />
    </>
  );
}
