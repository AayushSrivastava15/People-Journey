import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/context';

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md shadow-sm border-[#e8d5da]">
        <CardContent className="pt-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#fae8ee] text-[#8c5369] flex items-center justify-center mb-4">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-[#3d2f38]">
            Page Not Found
          </h1>
          <p className="mt-2 text-sm text-[#72616c]">
            The requested page could not be found or the link may have expired.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold shadow-sm transition-all"
              >
                <LayoutDashboard size={14} />
                Return to Dashboard
              </Link>
            ) : (
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#59424f] hover:bg-[#46333e] text-white text-xs font-semibold shadow-sm transition-all"
              >
                <ArrowLeft size={14} />
                Back to Home
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
