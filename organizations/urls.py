from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrganizationViewSet, StrategicObjectiveViewSet,
    ProgramViewSet, StrategicInitiativeViewSet,
    PerformanceMeasureViewSet, MainActivityViewSet,
    ActivityBudgetViewSet,SubActivityViewSet, ActivityCostingAssumptionViewSet,
    PlanViewSet, PlanReviewViewSet, InitiativeFeedViewSet,
    LocationViewSet, LandTransportViewSet, AirTransportViewSet,
    PerDiemViewSet, AccommodationViewSet, ParticipantCostViewSet,
    SessionCostViewSet, PrintingCostViewSet, SupervisorCostViewSet,
    ProcurementItemViewSet,login_view, logout_view, check_auth,
    update_profile, password_change
)
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from django.http import JsonResponse
router = DefaultRouter()
router.register(r'organizations', OrganizationViewSet)
router.register(r'strategic-objectives', StrategicObjectiveViewSet)
router.register(r'programs', ProgramViewSet)
router.register(r'strategic-initiatives', StrategicInitiativeViewSet)
router.register(r'performance-measures', PerformanceMeasureViewSet)
router.register(r'main-activities', MainActivityViewSet)
router.register(r'activity-budgets', ActivityBudgetViewSet)
router.register(r'sub-activities', SubActivityViewSet)
router.register(r'activity-costing-assumptions', ActivityCostingAssumptionViewSet)
router.register(r'plans', PlanViewSet)
router.register(r'plan-reviews', PlanReviewViewSet)
router.register(r'initiative-feeds', InitiativeFeedViewSet)
router.register(r'locations', LocationViewSet)
router.register(r'land-transports', LandTransportViewSet)
router.register(r'air-transports', AirTransportViewSet)
router.register(r'per-diems', PerDiemViewSet)
router.register(r'accommodations', AccommodationViewSet)
router.register(r'participant-costs', ParticipantCostViewSet)
router.register(r'session-costs', SessionCostViewSet)
router.register(r'printing-costs', PrintingCostViewSet)
router.register(r'supervisor-costs', SupervisorCostViewSet)
router.register(r'procurement-items', ProcurementItemViewSet)


# CSRF token endpoint
@ensure_csrf_cookie
def csrf_token_view(request):
    return JsonResponse({'detail': 'CSRF cookie set'})
urlpatterns = [
    path('', include(router.urls)),
   path('auth/login/', login_view, name='login'),
    path('auth/logout/', logout_view, name='logout'),
    path('auth/check/', check_auth, name='check_auth'),
    path('auth/csrf/', csrf_token_view, name='csrf_token'),
    path('auth/profile/', csrf_protect(update_profile), name='update_profile'),
    path('auth/password_change/', csrf_protect(password_change), name='password_change'),
    # Add custom budget update endpoint
    path('main-activities/<str:pk>/budget/', MainActivityViewSet.as_view({'post': 'update_budget'}), name='activity-budget-update'),
]