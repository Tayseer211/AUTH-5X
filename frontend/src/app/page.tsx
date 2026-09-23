import { CallToAction, Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Nav } from "@/components/Nav";
import { Products } from "@/components/Products";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Products />
        <HowItWorks />
        <CallToAction />
      </main>
      <Footer />
    </>
  );
}
