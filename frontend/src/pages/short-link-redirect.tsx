import { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import { CheckCircle2, AlertCircle, Clock, ExternalLink, RefreshCw, XCircle } from 'lucide-react';

interface ResolveResult {
  success: boolean;
  redirectUrl?: string;
  status?: string;
  message?: string;
  employee?: {
    name: string;
    code: string;
    designation: string;
    department: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export function ShortLinkRedirectPage() {
  const params = useParams<{ code: string }>();
  const code = params.code || '';
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    type: 'completed' | 'expired' | 'cancelled' | 'not_found' | 'error';
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!code) {
      setErrorState({
        type: 'not_found',
        title: 'Invalid Feedback Link',
        message: 'No survey reference was found in this URL. Please verify the link from your invitation email.',
      });
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function resolveSurvey() {
      try {
        const response = await fetch(`/api/exit-interviews/resolve/${encodeURIComponent(code)}`, {
          headers: {
            'Accept': 'application/json',
          },
        });

        const data: ResolveResult = await response.json().catch(() => ({
          success: false,
          error: { code: 'PARSE_ERROR', message: 'Could not parse response.' },
        }));

        if (!isMounted) return;

        if (response.ok && data.redirectUrl) {
          // Instantly redirect to the prefilled Google Form
          window.location.replace(data.redirectUrl);
          return;
        }

        // Handle specific business statuses
        if (data.status === 'COMPLETED' || data.error?.code === 'COMPLETED') {
          setErrorState({
            type: 'completed',
            title: 'Feedback Already Received',
            message: data.message || 'Thank you! Your exit feedback survey has already been submitted and safely recorded.',
          });
        } else if (data.error?.code === 'LINK_EXPIRED') {
          setErrorState({
            type: 'expired',
            title: 'Survey Link Expired',
            message: 'This survey link has expired. Please contact your HR department if you still wish to submit exit feedback.',
          });
        } else if (data.error?.code === 'LINK_CANCELLED') {
          setErrorState({
            type: 'cancelled',
            title: 'Invitation Replaced or Cancelled',
            message: 'This survey link is no longer valid because a newer invitation was generated or the request was cancelled.',
          });
        } else if (response.status === 404 || data.error?.code === 'NOT_FOUND') {
          setErrorState({
            type: 'not_found',
            title: 'Survey Link Not Found',
            message: 'We could not find an exit survey associated with this link. Please check the URL and try again.',
          });
        } else {
          setErrorState({
            type: 'error',
            title: 'Survey Unavailable',
            message: data.error?.message || 'We were unable to open the exit survey at this moment. Please try again shortly.',
          });
        }
      } catch (err) {
        if (!isMounted) return;
        setErrorState({
          type: 'error',
          title: 'Connection Issue',
          message: 'Unable to reach the survey service. Please check your internet connection or try again in a few moments.',
        });
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    resolveSurvey();

    return () => {
      isMounted = false;
    };
  }, [code]);

  return (
    <div className="min-h-screen bg-[#fcf9f9] text-[#443942] flex flex-col items-center justify-center p-6 selection:bg-[#f3dbe2]">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#eadfe0] p-8 md:p-10 text-center shadow-xl shadow-[#684a56]/5">
        {loading ? (
          <div className="flex flex-col items-center py-6">
            <div className="w-14 h-14 rounded-full bg-[#fdf2f4] border border-[#f8dbe3] flex items-center justify-center mb-5 animate-pulse">
              <RefreshCw className="w-6 h-6 text-[#b67c90] animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-[#3b2f37] tracking-tight mb-2">
              Opening Exit Feedback Form…
            </h1>
            <p className="text-sm text-[#72626c] leading-relaxed">
              Verifying your invitation reference and preparing the Infravision Google Form.
            </p>
          </div>
        ) : errorState ? (
          <div className="flex flex-col items-center">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mb-5 border ${
                errorState.type === 'completed'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : errorState.type === 'expired'
                  ? 'bg-amber-50 border-amber-200 text-amber-600'
                  : 'bg-[#fff5f7] border-[#f8dbe3] text-[#b67c90]'
              }`}
            >
              {errorState.type === 'completed' ? (
                <CheckCircle2 className="w-7 h-7" />
              ) : errorState.type === 'expired' ? (
                <Clock className="w-7 h-7" />
              ) : (
                <AlertCircle className="w-7 h-7" />
              )}
            </div>

            <h1 className="text-xl font-bold text-[#3b2f37] tracking-tight mb-2">
              {errorState.title}
            </h1>
            <p className="text-sm text-[#72626c] leading-relaxed mb-6">
              {errorState.message}
            </p>

            <div className="pt-4 border-t border-[#f0e7e8] w-full flex flex-col gap-2.5">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-[#59424f] hover:bg-[#493540] text-white transition-colors"
              >
                Go to Portal Home
              </Link>
            </div>
          </div>
        ) : null}

        <div className="mt-8 pt-6 border-t border-[#f7f0f1] flex items-center justify-center gap-2">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-[#a58e99]">
            People Journey · Infravision HR
          </span>
        </div>
      </div>
    </div>
  );
}

export default ShortLinkRedirectPage;

