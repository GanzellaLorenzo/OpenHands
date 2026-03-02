"""
New test suite for UserStore, modeled after test_api_key_store.py

This test suite focuses on testing the async methods of UserStore using
an SQLite database with proper fixtures.
"""

import uuid
from datetime import UTC, datetime
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import configure_mappers, sessionmaker
from sqlalchemy.pool import StaticPool

from storage.org import Org
from storage.user import User
from storage.user_store import UserStore
from storage.role import Role
from storage.base import Base


# Configure all mappers at module load time
configure_mappers()


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_litellm_api():
    """Mock LiteLLM API calls."""
    api_key_patch = patch('storage.lite_llm_manager.LITE_LLM_API_KEY', 'test_key')
    api_url_patch = patch(
        'storage.lite_llm_manager.LITE_LLM_API_URL', 'http://test.url'
    )
    team_id_patch = patch('storage.lite_llm_manager.LITE_LLM_TEAM_ID', 'test_team')
    client_patch = patch('httpx.AsyncClient')

    with api_key_patch, api_url_patch, team_id_patch, client_patch as mock_client:
        mock_response = AsyncMock()
        mock_response.is_success = True
        mock_response.json = MagicMock(return_value={'key': 'test_api_key'})
        mock_client.return_value.__aenter__.return_value.post.return_value = (
            mock_response
        )
        mock_client.return_value.__aenter__.return_value.get.return_value = (
            mock_response
        )
        mock_client.return_value.__aenter__.return_value.patch.return_value = (
            mock_response
        )
        yield mock_client


@pytest.fixture
def mock_stripe():
    """Mock Stripe API calls."""
    search_patch = patch(
        'stripe.Customer.search_async',
        AsyncMock(return_value=MagicMock(id='mock-customer-id')),
    )
    payment_patch = patch(
        'stripe.Customer.list_payment_methods_async',
        AsyncMock(return_value=MagicMock(data=[{}])),
    )
    with search_patch, payment_patch:
        yield


@pytest.fixture
def async_engine():
    """Create an in-memory async SQLite engine for testing."""
    engine = create_async_engine(
        'sqlite+aiosqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )

    async def create_tables():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    # Run the async function synchronously
    import asyncio
    asyncio.run(create_tables())
    return engine


@pytest.fixture
async def async_session_maker(async_engine):
    """Create an async session maker bound to the async engine."""
    async_session_maker = async_sessionmaker(
        bind=async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    return async_session_maker


@pytest.fixture
def sync_engine():
    """Create an in-memory sync SQLite engine for testing."""
    from sqlalchemy import create_engine
    engine = create_engine(
        'sqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def session_maker(sync_engine):
    """Create a sync session maker."""
    return sessionmaker(bind=sync_engine)


@pytest.fixture
async def setup_test_data(async_session_maker, session_maker):
    """Setup minimal test data including roles and orgs."""
    # Add a role using sync session
    with session_maker() as session:
        role = Role(id=1, name='owner', rank=1)
        session.add(role)
        session.commit()

    yield


# ============================================================================
# Helper functions
# ============================================================================


def _wrap_sync_as_async_session_maker(sync_sm):
    """Wrap a sync session_maker so it can be used in place of a_session_maker."""

    @asynccontextmanager
    async def _async_sm():
        session = sync_sm()
        try:

            class _AsyncWrapper:
                async def execute(self, *args, **kwargs):
                    return session.execute(*args, **kwargs)

                async def commit(self):
                    session.commit()

            yield _AsyncWrapper()
        finally:
            session.close()

    return _async_sm


# ============================================================================
# Tests for get_user_by_id_async
# ============================================================================


@pytest.mark.asyncio
async def test_get_user_by_id_async_found(async_session_maker, setup_test_data):
    """Test getting a user by ID when user exists."""
    # Setup - create a user in the database
    user_id = str(uuid.uuid4())
    org_id = uuid.uuid4()

    async with async_session_maker() as session:
        org = Org(
            id=org_id,
            name=f'test-org-{org_id}',
            contact_email='test@example.com',
        )
        session.add(org)
        
        user = User(
            id=uuid.UUID(user_id),
            current_org_id=org_id,
            email='user@example.com',
            email_verified=True,
        )
        session.add(user)
        await session.commit()

    # Execute - patch a_session_maker to use test's async session maker
    with patch('storage.user_store.a_session_maker', async_session_maker):
        result = await UserStore.get_user_by_id_async(user_id)

    # Verify
    assert result is not None
    assert str(result.id) == user_id
    assert result.email == 'user@example.com'
    assert result.current_org_id == org_id


@pytest.mark.asyncio
async def test_get_user_by_id_async_not_found(async_session_maker):
    """Test getting a user by ID when user doesn't exist."""
    # Execute
    non_existent_id = str(uuid.uuid4())
    with patch('storage.user_store.a_session_maker', async_session_maker):
        result = await UserStore.get_user_by_id_async(non_existent_id)

    # Verify
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_id_async_empty_string_raises(async_session_maker):
    """Test getting a user by ID with empty string raises ValueError."""
    # Execute and verify - empty string raises ValueError when converted to UUID
    with patch('storage.user_store.a_session_maker', async_session_maker):
        with pytest.raises(ValueError):
            await UserStore.get_user_by_id_async('')


# ============================================================================
# Tests for get_user_by_email_async
# ============================================================================


@pytest.mark.asyncio
async def test_get_user_by_email_async_found(async_session_maker, setup_test_data):
    """Test getting a user by email when user exists."""
    # Setup - create a user in the database
    user_id = str(uuid.uuid4())
    org_id = uuid.uuid4()
    test_email = 'testuser@example.com'

    async with async_session_maker() as session:
        org = Org(
            id=org_id,
            name=f'test-org-{org_id}',
            contact_email='test@example.com',
        )
        session.add(org)
        
        user = User(
            id=uuid.UUID(user_id),
            current_org_id=org_id,
            email=test_email,
            email_verified=True,
        )
        session.add(user)
        await session.commit()

    # Execute - patch a_session_maker to use test's async session maker
    with patch('storage.user_store.a_session_maker', async_session_maker):
        result = await UserStore.get_user_by_email_async(test_email)

    # Verify
    assert result is not None
    assert str(result.id) == user_id
    assert result.email == test_email.lower()


@pytest.mark.asyncio
async def test_get_user_by_email_async_not_found(async_session_maker):
    """Test getting a user by email when user doesn't exist."""
    # Execute
    with patch('storage.user_store.a_session_maker', async_session_maker):
        result = await UserStore.get_user_by_email_async('nonexistent@example.com')

    # Verify
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_email_async_empty_string(async_session_maker):
    """Test getting a user by email with empty string returns None."""
    # Execute
    with patch('storage.user_store.a_session_maker', async_session_maker):
        result = await UserStore.get_user_by_email_async('')

    # Verify
    assert result is None


# ============================================================================
# Tests for create_default_settings
# ============================================================================


@pytest.mark.asyncio
async def test_create_default_settings_no_org_id():
    """Test create_default_settings with empty org_id returns None."""
    # Execute
    result = await UserStore.create_default_settings('', 'test-user-id')

    # Verify
    assert result is None


@pytest.mark.asyncio
async def test_create_default_settings_with_org_id_no_stripe(mock_litellm_api, session_maker):
    """Test create_default_settings with org_id but no valid stripe customer."""
    # Setup - mock stripe to return no payment method
    with (
        patch(
            'stripe.Customer.list_payment_methods_async',
            AsyncMock(return_value=MagicMock(data=[])),
        ),
        patch('integrations.stripe_service.session_maker', session_maker),
        patch('storage.user_store.session_maker', session_maker),
        patch('storage.org_store.session_maker', session_maker),
        patch(
            'server.auth.token_manager.TokenManager.get_user_info_from_user_id',
            AsyncMock(return_value={'attributes': {'github_id': ['12345']}}),
        ),
    ):
        result = await UserStore.create_default_settings('test-org-id', 'test-user-id')

    # Verify - should return settings with litellm key
    assert result is not None
    assert result.llm_api_key.get_secret_value() == 'test_api_key'
    assert result.llm_base_url == 'http://test.url'


# ============================================================================
# Tests for update_user_email
# ============================================================================


@pytest.mark.asyncio
async def test_update_user_email_updates_email(async_session_maker, setup_test_data):
    """Test updating user email."""
    # Setup - create a user in the database
    user_id = str(uuid.uuid4())
    org_id = uuid.uuid4()

    async with async_session_maker() as session:
        org = Org(
            id=org_id,
            name=f'test-org-{org_id}',
            contact_email='test@example.com',
        )
        session.add(org)
        
        user = User(
            id=uuid.UUID(user_id),
            current_org_id=org_id,
            email='old@example.com',
            email_verified=False,
        )
        session.add(user)
        await session.commit()

    # Execute
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.update_user_email(user_id, email='new@example.com', email_verified=True)

    # Verify
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).filter(User.id == uuid.UUID(user_id))
        )
        user = result.scalars().first()
        assert user.email == 'new@example.com'
        assert user.email_verified is True


@pytest.mark.asyncio
async def test_update_user_email_only_verified(async_session_maker, setup_test_data):
    """Test updating only email_verified field."""
    # Setup - create a user in the database
    user_id = str(uuid.uuid4())
    org_id = uuid.uuid4()

    async with async_session_maker() as session:
        org = Org(
            id=org_id,
            name=f'test-org-{org_id}',
            contact_email='test@example.com',
        )
        session.add(org)
        
        user = User(
            id=uuid.UUID(user_id),
            current_org_id=org_id,
            email='keep@example.com',
            email_verified=False,
        )
        session.add(user)
        await session.commit()

    # Execute
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.update_user_email(user_id, email_verified=True)

    # Verify - email should remain, only email_verified changed
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).filter(User.id == uuid.UUID(user_id))
        )
        user = result.scalars().first()
        assert user.email == 'keep@example.com'
        assert user.email_verified is True


@pytest.mark.asyncio
async def test_update_user_email_noop_when_both_none(async_session_maker):
    """Test that update_user_email does nothing when both args are None."""
    user_id = str(uuid.uuid4())
    mock_session_maker = MagicMock()

    with patch('storage.user_store.a_session_maker', mock_session_maker):
        await UserStore.update_user_email(user_id, email=None, email_verified=None)

    mock_session_maker.assert_not_called()


@pytest.mark.asyncio
async def test_update_user_email_missing_user(async_session_maker):
    """Test updating email for non-existent user doesn't raise."""
    user_id = str(uuid.uuid4())

    # Should not raise, just log a warning
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.update_user_email(user_id, email='new@example.com', email_verified=True)

    # No exception means success


# ============================================================================
# Tests for backfill_user_email
# ============================================================================


@pytest.mark.asyncio
async def test_backfill_user_email_sets_null_email(async_session_maker, setup_test_data):
    """Test backfill_user_email sets email when currently NULL."""
    # Setup - create a user with NULL email
    user_id = str(uuid.uuid4())
    org_id = uuid.uuid4()

    async with async_session_maker() as session:
        org = Org(
            id=org_id,
            name=f'test-org-{org_id}',
            contact_email='test@example.com',
        )
        session.add(org)
        
        user = User(
            id=uuid.UUID(user_id),
            current_org_id=org_id,
            email=None,
            email_verified=None,
        )
        session.add(user)
        await session.commit()

    # Execute
    user_info = {'email': 'filled@example.com', 'email_verified': True}
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.backfill_user_email(user_id, user_info)

    # Verify - email should be filled
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).filter(User.id == uuid.UUID(user_id))
        )
        user = result.scalars().first()
        assert user.email == 'filled@example.com'
        assert user.email_verified is True


@pytest.mark.asyncio
async def test_backfill_user_email_preserves_existing(async_session_maker, setup_test_data):
    """Test backfill_user_email doesn't overwrite existing email."""
    # Setup - create a user with existing email
    user_id = str(uuid.uuid4())
    org_id = uuid.uuid4()

    async with async_session_maker() as session:
        org = Org(
            id=org_id,
            name=f'test-org-{org_id}',
            contact_email='test@example.com',
        )
        session.add(org)
        
        user = User(
            id=uuid.UUID(user_id),
            current_org_id=org_id,
            email='existing@example.com',
            email_verified=True,
        )
        session.add(user)
        await session.commit()

    # Execute
    user_info = {'email': 'new@example.com', 'email_verified': False}
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.backfill_user_email(user_id, user_info)

    # Verify - email should remain unchanged
    async with async_session_maker() as session:
        result = await session.execute(
            select(User).filter(User.id == uuid.UUID(user_id))
        )
        user = result.scalars().first()
        assert user.email == 'existing@example.com'
        assert user.email_verified is True  # Also preserved


@pytest.mark.asyncio
async def test_backfill_user_email_missing_user(async_session_maker):
    """Test backfill_user_email with non-existent user doesn't raise."""
    user_id = str(uuid.uuid4())

    # Should not raise, just log
    user_info = {'email': 'test@example.com', 'email_verified': True}
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.backfill_user_email(user_id, user_info)

    # No exception means success


# ============================================================================
# Tests for backfill_contact_name
# ============================================================================


@pytest.mark.asyncio
async def test_backfill_contact_name_updates_when_matches_username(
    async_session_maker, setup_test_data
):
    """Test backfill_contact_name updates when contact_name matches preferred_username."""
    # Setup - create an org with username-style contact_name
    user_id = str(uuid.uuid4())

    async with async_session_maker() as session:
        org = Org(
            id=uuid.UUID(user_id),
            name=f'user_{user_id}_org',
            contact_name='jdoe',  # username-style
            contact_email='jdoe@example.com',
        )
        session.add(org)
        await session.commit()

    # Execute
    user_info = {
        'preferred_username': 'jdoe',
        'name': 'John Doe',  # real name available
    }
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.backfill_contact_name(user_id, user_info)

    # Verify - contact_name should be updated
    async with async_session_maker() as session:
        result = await session.execute(
            select(Org).filter(Org.id == uuid.UUID(user_id))
        )
        org = result.scalars().first()
        assert org.contact_name == 'John Doe'


@pytest.mark.asyncio
async def test_backfill_contact_name_preserves_custom(async_session_maker, setup_test_data):
    """Test backfill_contact_name preserves custom contact_name."""
    # Setup - create an org with custom contact_name (not matching username)
    user_id = str(uuid.uuid4())

    async with async_session_maker() as session:
        org = Org(
            id=uuid.UUID(user_id),
            name=f'user_{user_id}_org',
            contact_name='Custom Name',  # custom value
            contact_email='jdoe@example.com',
        )
        session.add(org)
        await session.commit()

    # Execute
    user_info = {
        'preferred_username': 'jdoe',
        'name': 'John Doe',
    }
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.backfill_contact_name(user_id, user_info)

    # Verify - contact_name should remain unchanged
    async with async_session_maker() as session:
        result = await session.execute(
            select(Org).filter(Org.id == uuid.UUID(user_id))
        )
        org = result.scalars().first()
        assert org.contact_name == 'Custom Name'


@pytest.mark.asyncio
async def test_backfill_contact_name_no_real_name(async_session_maker, setup_test_data):
    """Test backfill_contact_name does nothing when no real name available."""
    # Setup - create an org
    user_id = str(uuid.uuid4())

    async with async_session_maker() as session:
        org = Org(
            id=uuid.UUID(user_id),
            name=f'user_{user_id}_org',
            contact_name='jdoe',
            contact_email='jdoe@example.com',
        )
        session.add(org)
        await session.commit()

    # Execute - no name in user_info
    user_info = {
        'preferred_username': 'jdoe',
    }
    with patch('storage.user_store.a_session_maker', async_session_maker):
        await UserStore.backfill_contact_name(user_id, user_info)

    # Verify - contact_name should remain unchanged
    async with async_session_maker() as session:
        result = await session.execute(
            select(Org).filter(Org.id == uuid.UUID(user_id))
        )
        org = result.scalars().first()
        assert org.contact_name == 'jdoe'


# ============================================================================
# Tests for list_users (sync)
# ============================================================================


def test_list_users(session_maker, setup_test_data):
    """Test listing all users."""
    # Setup - create users in the database
    org_id = uuid.uuid4()

    with session_maker() as session:
        org = Org(
            id=org_id,
            name=f'test-org-{org_id}',
            contact_email='test@example.com',
        )
        session.add(org)
        
        user1 = User(
            id=uuid.uuid4(),
            current_org_id=org_id,
            email='user1@example.com',
        )
        user2 = User(
            id=uuid.uuid4(),
            current_org_id=org_id,
            email='user2@example.com',
        )
        session.add_all([user1, user2])
        session.commit()

    # Execute
    with patch('storage.user_store.session_maker', session_maker):
        users = UserStore.list_users()

    # Verify
    assert len(users) >= 2
    emails = [user.email for user in users]
    assert 'user1@example.com' in emails
    assert 'user2@example.com' in emails


# ============================================================================
# Tests for update_current_org (sync)
# ============================================================================


def test_update_current_org_success(session_maker, setup_test_data):
    """Test updating user's current org."""
    # Setup
    user_id = str(uuid.uuid4())
    initial_org_id = uuid.uuid4()
    new_org_id = uuid.uuid4()

    with session_maker() as session:
        org1 = Org(
            id=initial_org_id,
            name=f'org-{initial_org_id}',
            contact_email='test1@example.com',
        )
        org2 = Org(
            id=new_org_id,
            name=f'org-{new_org_id}',
            contact_email='test2@example.com',
        )
        session.add_all([org1, org2])
        
        user = User(
            id=uuid.UUID(user_id),
            current_org_id=initial_org_id,
            email='user@example.com',
        )
        session.add(user)
        session.commit()

    # Execute
    with patch('storage.user_store.session_maker', session_maker):
        result = UserStore.update_current_org(user_id, new_org_id)

    # Verify
    assert result is not None
    assert result.current_org_id == new_org_id


def test_update_current_org_not_found(session_maker):
    """Test updating org for non-existent user returns None."""
    # Execute
    with patch('storage.user_store.session_maker', session_maker):
        result = UserStore.update_current_org(str(uuid.uuid4()), uuid.uuid4())

    # Verify
    assert result is None


# ============================================================================
# Tests for get_kwargs_from_settings
# ============================================================================


def test_get_kwargs_from_settings():
    """Test extracting user kwargs from settings."""
    from openhands.storage.data_models.settings import Settings
    from pydantic import SecretStr

    settings = Settings(
        language='es',
        enable_sound_notifications=True,
        llm_api_key=SecretStr('test-key'),
    )

    kwargs = UserStore.get_kwargs_from_settings(settings)

    # Should only include fields that exist in User model
    assert 'language' in kwargs
    assert 'enable_sound_notifications' in kwargs
    # Should not include fields that don't exist in User model
    assert 'llm_api_key' not in kwargs
